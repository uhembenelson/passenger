import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, X } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { WebView } from "react-native-webview";
import { Button, colors, fontFamily, Txt } from "./ui";

export type LivenessAsset = {
  uri?: string;
  file?: Blob;
  filename: string;
  mime: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: LivenessAsset) => void;
};

const LIVENESS_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html { width: 100%; height: 100%; overflow: hidden; background: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    #video { position: absolute; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 32px 20px 48px; z-index: 10; }
    .guide-container { position: relative; width: 260px; height: 340px; margin: auto; }
    .guide-oval { width: 100%; height: 100%; border-radius: 50% / 45%; border: 3px dashed rgba(255, 255, 255, 0.45); transition: border 0.3s, transform 0.3s; }
    .guide-oval.detected { border-style: solid; border-color: #F59E0B; }
    .guide-oval.success { border-style: solid; border-color: #10B981; border-width: 4px; transform: scale(1.02); }
    .instruction-card { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 16px 24px; border-radius: 20px; color: #fff; text-align: center; max-width: 90%; width: 340px; border: 1px solid rgba(255, 255, 255, 0.1); }
    .instruction-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .instruction-sub { font-size: 13px; color: #94A3B8; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); font-size: 12px; font-weight: 500; color: #E2E8F0; border: 1px solid rgba(255, 255, 255, 0.1); }
    .indicator-dot { width: 8px; height: 8px; border-radius: 999px; background: #94A3B8; }
    .indicator-dot.active { background: #10B981; }
  </style>
</head>
<body>
  <video id="video" playsinline autoplay muted></video>
  <div class="overlay">
    <div id="badge" class="status-badge"><span class="indicator-dot"></span><span id="badgeText">Starting camera…</span></div>
    <div class="guide-container">
      <div id="oval" class="guide-oval"></div>
    </div>
    <div class="instruction-card">
      <div id="instructionTitle" class="instruction-title">Position your face in the oval</div>
      <div id="instructionSub" class="instruction-sub">Make sure your face is clearly visible</div>
    </div>
  </div>

  <script type="module">
    const video = document.getElementById("video");
    const oval = document.getElementById("oval");
    const badgeText = document.getElementById("badgeText");
    const title = document.getElementById("instructionTitle");
    const sub = document.getElementById("instructionSub");

    let faceLandmarker = null;
    let state = "detect_face";
    let captured = false;
    let faceMissCount = 0;

    function sendToRN(payload) {
      const msg = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      } else if (window.parent) {
        window.parent.postMessage(msg, "*");
      }
    }

    async function init() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera access is unavailable in this view. Please reopen the live check.");
        }

        let stream;
        try {
          stream = await cameraWithTimeout({
            video: { facingMode: "user" },
            audio: false
          });
        } catch {
          stream = await cameraWithTimeout({ video: true, audio: false });
        }

        video.srcObject = stream;
        await video.play();

        badgeText.innerText = "Loading face detection…";
        const { FilesetResolver, FaceLandmarker } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const options = {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        };
        try {
          faceLandmarker = await FaceLandmarker.createFromOptions(vision, options);
        } catch {
          options.baseOptions.delegate = "CPU";
          faceLandmarker = await FaceLandmarker.createFromOptions(vision, options);
        }

        badgeText.innerText = "Camera ready";
        requestAnimationFrame(processFrame);
      } catch (err) {
        badgeText.innerText = "Camera unavailable";
        title.innerText = "Live check unavailable";
        sub.innerText = "Close this screen and try again.";
        sendToRN({ type: "error", message: err.message || "Failed to initialize camera" });
      }
    }

    function cameraWithTimeout(constraints) {
      return Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        new Promise((_, reject) => setTimeout(() => reject(new Error("The camera did not start. Please try again.")), 12000))
      ]);
    }

    let lastVideoTime = -1;
    function processFrame() {
      if (captured) return;

      if (faceLandmarker && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = faceLandmarker.detectForVideo(video, performance.now());

        if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
          faceMissCount = 0;
          oval.className = "guide-oval detected";
          const categories = results.faceBlendshapes?.[0]?.categories || [];
          const getCategoryScore = (name) => categories.find(c => c.categoryName === name)?.score || 0;

          const blinkL = getCategoryScore("eyeBlinkLeft");
          const blinkR = getCategoryScore("eyeBlinkRight");
          const smileL = getCategoryScore("mouthSmileLeft");
          const smileR = getCategoryScore("mouthSmileRight");

          if (state === "detect_face") {
            badgeText.innerText = "Face recognized";
            title.innerText = "Blink your eyes";
            sub.innerText = "Blink naturally to confirm live presence";
            state = "blink";
          } else if (state === "blink") {
            if (blinkL > 0.42 && blinkR > 0.42) {
              badgeText.innerText = "Blink verified";
              title.innerText = "Smile gently";
              sub.innerText = "Show a natural smile to the camera";
              state = "smile";
            }
          } else if (state === "smile") {
            if (smileL > 0.38 || smileR > 0.38) {
              oval.className = "guide-oval success";
              badgeText.innerText = "Liveness verified";
              title.innerText = "Hold still";
              sub.innerText = "Capturing photo…";
              captured = true;
              state = "done";
              setTimeout(capturePhoto, 350);
              return;
            }
          }
        } else {
          faceMissCount += 1;
          if (faceMissCount > 5) {
            oval.className = "guide-oval";
            if (state !== "done") {
              badgeText.innerText = "Looking for face";
              title.innerText = "Position your face in the oval";
              sub.innerText = "Hold your phone steady at eye level";
            }
          }
        }
      }

      requestAnimationFrame(processFrame);
    }

    function capturePhoto() {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      if (video.srcObject) video.srcObject.getTracks().forEach(track => track.stop());
      sendToRN({ type: "success", dataUrl });
    }

    init();
  </script>
</body>
</html>`;

export function LivenessCameraModal({ visible, onClose, onCapture }: Props) {
  const [permissionStatus, setPermissionStatus] = useState<"checking" | "prompt" | "granted" | "denied">("checking");
  const [processing, setProcessing] = useState(false);
  const [errorNotice, setErrorNotice] = useState("");
  const [cameraAttempt, setCameraAttempt] = useState(0);

  useEffect(() => {
    if (!visible) return;
    void (async () => {
      try {
        const current = await ImagePicker.getCameraPermissionsAsync();
        if (current.granted) {
          setPermissionStatus("granted");
        } else {
          setPermissionStatus("prompt");
        }
      } catch {
        setPermissionStatus("prompt");
      }
    })();
  }, [visible]);

  const requestPermission = async () => {
    try {
      const result = await ImagePicker.requestCameraPermissionsAsync();
      if (result.granted) {
        setPermissionStatus("granted");
      } else {
        setPermissionStatus("denied");
      }
    } catch {
      setPermissionStatus("denied");
    }
  };

  const handleMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.type === "success" && payload.dataUrl) {
        setProcessing(true);
        const dataUrl = payload.dataUrl as string;
        const base64Index = dataUrl.indexOf(",");
        const base64Data = base64Index !== -1 ? dataUrl.slice(base64Index + 1) : dataUrl;

        if (Platform.OS === "web") {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          onCapture({
            file: blob,
            filename: `liveness_${Date.now()}.jpg`,
            mime: "image/jpeg",
          });
        } else {
          const path = `${FileSystem.cacheDirectory ?? ""}liveness_${Date.now()}.jpg`;
          await FileSystem.writeAsStringAsync(path, base64Data, { encoding: FileSystem.EncodingType.Base64 });
          onCapture({
            uri: path,
            filename: `liveness_${Date.now()}.jpg`,
            mime: "image/jpeg",
          });
        }
        setProcessing(false);
      } else if (payload.type === "error") {
        setErrorNotice(payload.message ?? "Could not start camera");
      }
    } catch (e) {
      console.warn("[liveness] error handling camera message", e);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close live check" onPress={onClose} style={styles.closeBtn}>
            <X size={22} color="#FFFFFF" />
          </Pressable>
          <Txt style={styles.headerTitle}>Live identity check</Txt>
          <View style={styles.closeBtn} />
        </View>

        {permissionStatus === "checking" ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : permissionStatus === "prompt" ? (
          <View style={styles.promptCard}>
            <View style={styles.iconCircle}>
              <Camera size={36} color="#10B981" />
            </View>
            <Txt style={styles.promptTitle}>Camera access required</Txt>
            <Txt style={styles.promptBody}>
              Passenger uses your front camera to confirm you are a real person during identity verification. Your photo is private and used only for comparison.
            </Txt>
            <View style={styles.promptButtons}>
              <Button title="Allow camera access" variant="lime" onPress={() => void requestPermission()} />
              <Button title="Not now" variant="ghost" onPress={onClose} />
            </View>
          </View>
        ) : permissionStatus === "denied" ? (
          <View style={styles.promptCard}>
            <View style={[styles.iconCircle, { backgroundColor: "#331E1E" }]}>
              <Camera size={36} color="#EF4444" />
            </View>
            <Txt style={styles.promptTitle}>Camera permission denied</Txt>
            <Txt style={styles.promptBody}>
              Camera access was denied. You can enable it in your device settings to continue with identity verification.
            </Txt>
            <View style={styles.promptButtons}>
              <Button title="Open device settings" variant="lime" onPress={() => void Linking.openSettings()} />
              <Button title="Go back" variant="ghost" onPress={onClose} />
            </View>
          </View>
        ) : (
          <View style={styles.webContainer}>
            <WebView
              key={cameraAttempt}
              source={{ html: LIVENESS_HTML, baseUrl: "https://localhost/" }}
              originWhitelist={["*"]}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback={true}
              mediaCapturePermissionGrantType="grant"
              onPermissionRequest={(request: any) => request.grant(request.resources)}
              onMessage={handleMessage}
              onError={event => setErrorNotice(event.nativeEvent.description || "Could not load the live camera.")}
              style={styles.webView}
            />
            {!!errorNotice && <View style={styles.cameraError}><Txt style={styles.promptTitle}>Camera unavailable</Txt><Txt style={styles.promptBody}>{errorNotice}</Txt><Button title="Try again" variant="lime" onPress={() => { setErrorNotice(""); setCameraAttempt(current => current + 1); }} /><Button title="Go back" variant="ghost" onPress={onClose} /></View>}
            {processing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Txt style={styles.processingText}>Securing live capture…</Txt>
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: "#000000",
  },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontFamily: fontFamily.semibold, fontSize: 16 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  promptCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#064E3B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  promptTitle: {
    color: "#FFFFFF",
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    textAlign: "center",
  },
  promptBody: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
  },
  promptButtons: {
    width: "100%",
    maxWidth: 320,
    gap: 12,
    marginTop: 16,
  },
  webContainer: { flex: 1, position: "relative", backgroundColor: "#000000" },
  webView: { flex: 1, backgroundColor: "#000000" },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  processingText: { color: "#FFFFFF", fontFamily: fontFamily.medium, fontSize: 15 },
  cameraError: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#000000", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 18 },
});
