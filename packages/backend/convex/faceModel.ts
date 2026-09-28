"use node";

import * as tf from "@tensorflow/tfjs";
import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import * as jpeg from "jpeg-js";
import { PNG } from "pngjs";

// Pin the weights and the descriptor model together. Changing either requires
// a new vector index: old and new embeddings must never be compared.
export const FACE_MODEL_VERSION = "face-api-1.7.15-tiny-128";
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
const MAX_PIXELS = 5_000_000;
let ready: Promise<void> | undefined;

async function loadModels(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await tf.setBackend("cpu");
      await tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    })().catch(error => { ready = undefined; throw error; });
  }
  return ready;
}

function decodePixels(bytes: Buffer): { width: number; height: number; data: Uint8Array } {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 5 });
    if (image.width * image.height > MAX_PIXELS) throw new Error("The image is too large. Please retake it.");
    return image;
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (bytes.length < 24 || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > MAX_PIXELS) {
      throw new Error("The image is too large. Please retake it.");
    }
    return PNG.sync.read(bytes);
  }
  throw new Error("Use a JPEG or PNG face photo.");
}

export async function extractFaceDescriptor(bytes: Buffer): Promise<number[]> {
  const { width, height, data } = decodePixels(bytes);
  if (!width || !height || data.length !== width * height * 4) throw new Error("The face photo is invalid. Please retake it.");
  await loadModels();
  const rgb = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = data[pixel * 4]!;
    rgb[pixel * 3 + 1] = data[pixel * 4 + 1]!;
    rgb[pixel * 3 + 2] = data[pixel * 4 + 2]!;
  }
  const image = faceapi.tf.tensor3d(rgb, [height, width, 3], "int32");
  try {
    const faces = await faceapi.detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceLandmarks(true).withFaceDescriptors();
    if (faces.length !== 1) throw new Error(faces.length ? "Only one face can be in the photo. Please retake it." : "No clear face was found. Please retake the photo.");
    const descriptor = Array.from(faces[0]!.descriptor);
    if (descriptor.length !== 128 || !descriptor.every(Number.isFinite)) throw new Error("The face model returned an invalid descriptor.");
    const norm = Math.hypot(...descriptor);
    if (!Number.isFinite(norm) || norm === 0) throw new Error("The face model returned an empty descriptor.");
    return descriptor.map(value => value / norm);
  } finally {
    image.dispose();
  }
}
