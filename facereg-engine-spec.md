# FaceReg Engine Specification

This document provides a complete blueprint for an **Expo (Frontend) + Convex (Backend)** facial recognition service. The embedding extraction and vector matching are fully managed on the backend using **Convex Actions**, keeping the Expo client lightweight and fast.

---

## 1. System Architecture

1. **Expo Mobile Client**: Captures a face image using `expo-image-picker` or `expo-camera`, requests a secure upload URL from Convex, and uploads the raw image to Convex File Storage.
2. **Convex Storage**: Stores the image securely and generates a temporary or permanent file access URL.
3. **Convex Action (`engine:processAndMatch`)**: Feches the image URL, sends it to a fast serverless face-embedding model (via Replicate/Hugging Face API), extracts a 512-dimension vector, and invokes the vector comparison engine.
4. **Convex Vector Index**: Runs an instant cosine-similarity vector search across all saved records to register or identify the person.

---

## 2. Convex Backend Setup

### Database Schema (`convex/schema.ts`)

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  faces: defineTable({
    userId: v.string(),             // Link to the user profile
    storageId: v.string(),          // Reference to Convex File Storage
    embedding: v.array(v.number()),   // 512-dimensional facial embedding vector
    createdAt: v.string(),
  }).vectorIndex("by_face_embedding", {
    vectorField: "embedding",
    dimensions: 512,                // Adjust if using a model with 128 or 1024 dimensions
  }),
});
```

### Backend Implementation (`convex/engine.ts`)

```typescript
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// 1. Generate a secure file upload URL for the frontend
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// 2. Action: Extract embedding from stored image and search for a match
export const processAndMatchFace = action({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    // A. Retrieve the accessible file URL from Convex storage
    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (!imageUrl) throw new Error("File not found in storage");

    // B. Call external AI service to get the face embedding vector
    // This example uses Replicate (InsightFace or FaceNet deployment)
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) throw new Error("REPLICATE_API_TOKEN is not configured in Convex dashboard");

    const aiResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${replicateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Replace with your selected public face-embedding model version hash
        version: "a5263fb8eb70c9eb02b0c1ec25cb2909415c32b535694a50d24fa10b9f9392e9", 
        input: { image: imageUrl }
      }),
    });

    const prediction = await aiResponse.json();
    
    // Poll for the prediction result if it processes asynchronously, 
    // or handle direct synchronous responses depending on the API provider setup.
    // For brevity, assuming 'embedding' array directly returned in output:
    const embedding = prediction?.output?.embedding as number[];
    if (!embedding || embedding.length !== 512) {
      throw new Error("Failed to extract valid 512-dimension face embedding");
    }

    // C. Execute internal vector search query to find the match
    const matchResult = await ctx.runQuery(internal.engine.searchVectorIndex, {
      embedding,
    });

    return matchResult;
  },
});

// 3. Internal Query: Search the vector index for closest match
export const searchVectorIndex = query({
  args: { embedding: v.array(v.number()) },
  handler: async (ctx, args) => {
    const results = await ctx.vectorSearch("faces", "by_face_embedding", {
      vector: args.embedding,
      limit: 1,
    });

    if (results.length === 0) {
      return { isMatch: false, message: "No facial records exist in index" };
    }

    const bestMatch = results[0];
    const MATCH_THRESHOLD = 0.80; // Tune based on real-world precision requirements

    if (bestMatch._score >= MATCH_THRESHOLD) {
      const matchedRecord = await ctx.db.get(bestMatch._id);
      return {
        isMatch: true,
        userId: matchedRecord?.userId,
        confidence: bestMatch._score,
      };
    }

    return {
      isMatch: false,
      confidence: bestMatch._score,
      message: "Face found but confidence score fell below acceptable threshold",
    };
  },
});

// 4. Mutation: Register face to the index after processing embedding
export const registerProcessedFace = mutation({
  args: {
    userId: v.string(),
    storageId: v.string(),
    embedding: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("faces", {
      userId: args.userId,
      storageId: args.storageId,
      embedding: args.embedding,
      createdAt: new Date().toISOString(),
    });
  },
});
```

---

## 3. Expo Frontend Integration (Client App)

Use this implementation workflow inside your React Native / Expo application to interact cleanly with the backend service.

```typescript
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useAction } from 'convex/react';
import { api } from './convex/_generated/api';

export default function FaceVerificationScreen() {
  const [loading, setLoading] = useState(false);
  
  // Convex API Hooks
  const generateUploadUrl = useMutation(api.engine.generateUploadUrl);
  const processAndMatchFace = useAction(api.engine.processAndMatchFace);

  const handleVerifyIdentity = async () => {
    // 1. Request camera permissions & capture facial image
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Camera access is required to verify identity.");
      return;
    }

    const imageResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1], // Force 1:1 aspect ratio square for best facial alignment
      quality: 0.8,   // Compress slightly to optimize upload speed
    });

    if (imageResult.canceled || !imageResult.assets?.[0]?.uri) return;
    
    setLoading(true);
    try {
      const localUri = imageResult.assets[0].uri;

      // 2. Request unique upload target from Convex File Storage
      const uploadUrl = await generateUploadUrl();

      // 3. Convert image asset to binary Blob and POST to Convex Storage
      const imageFetch = await fetch(localUri);
      const blob = await imageFetch.blob();
      
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });

      if (!uploadResponse.ok) throw new Error("Failed to upload image asset.");
      const { storageId } = await uploadResponse.ok ? await uploadResponse.json() : { storageId: null };
      if (!storageId) throw new Error("Failed to acquire valid Storage ID.");

      // 4. Request Convex backend Action to parse face, generate vector, and evaluate
      const verificationReport = await processAndMatchFace({ storageId });

      // 5. Present result to user
      if (verificationReport.isMatch) {
        Alert.alert("Identity Verified", `Match confirmed! User: ${verificationReport.userId}`);
      } else {
        Alert.alert("Verification Failed", verificationReport.message || "Face does not match database record.");
      }

    } catch (error) {
      console.error(error);
      Alert.alert("System Error", "An error occurred while communicating with the FaceReg Engine.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FaceReg Engine Client</Text>
      <TouchableOpacity 
        style={[styles.button, loading && styles.disabledButton]} 
        onPress={handleVerifyIdentity}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Verify Biometric Identity</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 24, color: '#111827' },
  button: { backgroundColor: '#2563EB', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 8, minWidth: 220, alignItems: 'center' },
  disabledButton: { backgroundColor: '#9CA3AF' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
```