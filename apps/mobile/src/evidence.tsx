import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { ExternalLink } from "lucide-react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { usePassengerState } from "./data";
import { Button, colors, errorMessage, ExpandableText, InlineSkeleton, Notice, ProgressiveImage, s, Txt } from "./ui";

const ALLOWED_MIME_TYPES = {
  identity: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  parcel: ["image/jpeg", "image/png", "image/webp"],
} as const;

type UploadAsset = { uri?: string; file?: Blob; filename: string; mime?: string | null; size?: number | null };
const PENDING_EVIDENCE_RESUME_KEY = "passenger.pendingEvidenceResume";

async function setPendingEvidenceResumeKey(value: string | null) {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return;
      if (value === null) localStorage.removeItem(PENDING_EVIDENCE_RESUME_KEY);
      else localStorage.setItem(PENDING_EVIDENCE_RESUME_KEY, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(PENDING_EVIDENCE_RESUME_KEY);
    else await SecureStore.setItemAsync(PENDING_EVIDENCE_RESUME_KEY, value);
  } catch {
    // Ignore storage failures
  }
}

export async function getPendingEvidenceResumeKey() {
  try {
    if (Platform.OS === "web") return typeof localStorage === "undefined" ? null : localStorage.getItem(PENDING_EVIDENCE_RESUME_KEY);
    return await SecureStore.getItemAsync(PENDING_EVIDENCE_RESUME_KEY);
  } catch {
    return null;
  }
}

function uploadAssetFromPickerAsset(asset: {
  uri: string;
  file?: Blob | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}) {
  return {
    uri: asset.uri,
    // Keep native uploads on the filesystem path instead of copying the
    // whole camera image into JS memory, which is more likely to kill the app.
    file: Platform.OS === "web" ? asset.file ?? undefined : undefined,
    filename: asset.fileName || `photo-${Date.now()}.jpg`,
    mime: asset.mimeType || "image/jpeg",
    size: asset.fileSize ?? asset.file?.size,
  } satisfies UploadAsset;
}

function inferMimeType(filename: string) {
  const normalized = filename.trim().toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  return "";
}

function resolveMimeType(purpose: "identity" | "parcel", filename: string, mime?: string | null) {
  const normalized = mime?.trim().toLowerCase().split(";")[0] ?? "";
  const aliased = normalized === "image/jpg" || normalized === "image/pjpeg"
    ? "image/jpeg"
    : normalized === "application/x-pdf"
      ? "application/pdf"
      : normalized;
  const inferred = inferMimeType(filename);
  const allowed = ALLOWED_MIME_TYPES[purpose] as readonly string[];
  const resolved = allowed.includes(aliased) ? aliased : allowed.includes(inferred) ? inferred : aliased || inferred;
  if (!allowed.includes(resolved)) {
    throw new Error(purpose === "identity" ? "Choose a JPEG, PNG, or WebP image, or a PDF document." : "Choose a JPEG, PNG, or WebP image.");
  }
  return resolved;
}

async function getAssetSize(asset: UploadAsset) {
  if (typeof asset.size === "number") return asset.size;
  if (asset.file) return asset.file.size;
  if (!asset.uri) throw new Error("Passenger could not read that file from your device.");
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || info.isDirectory) throw new Error("Passenger could not read that file from your device.");
  return info.size;
}

export function EvidencePicker({ purpose, value, onChange, disabled, resumeKey, compact = false, minimal = false, onBusyChange }: { purpose: "identity" | "parcel"; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; resumeKey?: string; compact?: boolean; minimal?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const uploadUrl = useMutation(api.evidence.generateUploadUrl);
  const register = useMutation(api.evidence.register);
  const { offline } = usePassengerState();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const checkedPending = useRef(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const upload = async (asset: UploadAsset) => {
    const mime = resolveMimeType(purpose, asset.filename, asset.mime);
    const size = await getAssetSize(asset);
    if (size > 10 * 1024 * 1024) throw new Error("Choose a file smaller than 10 MB.");
    if (!size) throw new Error("This file is empty. Choose another file.");
    const url = await uploadUrl({ purpose });
    let body: unknown;
    if (asset.file) {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": mime }, body: asset.file });
      if (!response.ok) throw new Error("The upload did not complete. Check your connection and choose the file again.");
      body = await response.json();
    } else {
      if (!asset.uri) throw new Error("Passenger could not read that file from your device.");
      const response = await FileSystem.uploadAsync(url, asset.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mime },
      });
      if (response.status < 200 || response.status >= 300) throw new Error("The upload did not complete. Check your connection and choose the file again.");
      try {
        body = JSON.parse(response.body);
      } catch {
        throw new Error("Unable to read upload response. Check your connection and try again.");
      }
    }
    if (!body || typeof body !== "object" || !("storageId" in body) || typeof body.storageId !== "string") throw new Error("The storage service did not confirm this upload.");
    return await register({ storageId: body.storageId as Id<"_storage">, purpose, filename: asset.filename });
  };
  const processAsset = async (asset?: UploadAsset) => {
    if (!asset) return;
    const id = await upload(asset);
    onChange([...value, id]);
    await setPendingEvidenceResumeKey(null);
  };
  const pick = async (camera: boolean) => {
    setError(""); setBusy(true);
    try {
      if (offline) throw new Error("Reconnect before uploading evidence.");
      let asset: UploadAsset | undefined;
      if (camera) {
        if (resumeKey) await setPendingEvidenceResumeKey(resumeKey);
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Allow camera access in your device settings, or choose an existing file instead.");
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
        const photo = !result.canceled ? result.assets[0] : undefined;
        if (!photo) await setPendingEvidenceResumeKey(null);
        if (photo) asset = uploadAssetFromPickerAsset(photo);
      } else if (purpose === "parcel") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Allow photo library access in your device settings, or take a photo instead.");
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
        const photo = !result.canceled ? result.assets[0] : undefined;
        if (photo) asset = uploadAssetFromPickerAsset(photo);
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], copyToCacheDirectory: true, multiple: false, base64: false });
        const file = !result.canceled ? result.assets[0] : undefined;
        if (file) asset = { uri: file.uri, file: file.file, filename: file.name || `document-${Date.now()}`, mime: file.mimeType, size: file.size ?? file.file?.size };
      }
      await processAsset(asset);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (checkedPending.current) return;
    checkedPending.current = true;
    void (async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        const photo = pending && "assets" in pending && !pending.canceled ? pending.assets?.[0] : undefined;
        if (!photo) {
          await setPendingEvidenceResumeKey(null);
          return;
        }
        setBusy(true);
        setError("");
        if (offline) throw new Error("Reconnect before uploading evidence.");
        await processAsset(uploadAssetFromPickerAsset(photo));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    })();
  }, [offline, onChange, purpose, register, resumeKey, uploadUrl, value]);
  return <View style={{ gap: 12, marginBottom: 18 }}>{!compact && <Txt style={s.label}>{purpose === "identity" ? "Private identity evidence" : "Package photos"}</Txt>}{!minimal && <Txt style={s.hint}>{compact ? purpose === "identity" ? "JPEG, PNG, WebP or PDF. " : "JPEG, PNG or WebP. " : <>{purpose === "identity" ? "Upload a clear, legible identity document. Only you and authorized reviewers can access it. JPEG, PNG, WebP or PDF." : "Show the contents and packaging clearly. Photos are available only to authorized delivery participants and reviewers."} </>}Up to 5 files, 10 MB each.</Txt>}
    {value.map(id => <View key={id} style={{ gap: 5 }}><EvidenceItem id={id} minimal={minimal} />{!disabled && <Button title="Remove attachment" small variant="ghost" disabled={busy || offline} onPress={() => onChange(value.filter(item => item !== id))} />}</View>)}
    <View style={[s.row, { flexWrap: "wrap" }]}><Button title={busy ? "Uploading securely…" : purpose === "parcel" ? "Choose from gallery" : "Choose a file"} small variant="secondary" busy={busy} disabled={disabled || offline || value.length >= 5} onPress={() => void pick(false)} /><Button title="Take a photo" small variant="secondary" disabled={disabled || busy || offline || value.length >= 5} onPress={() => void pick(true)} /></View>{busy && <Txt style={s.hint}>Keep this screen open while your file uploads.</Txt>}{error !== "" && <Notice tone="error">{error}</Notice>}
  </View>;
}
function EvidenceItem({ id, minimal = false }: { id: string; minimal?: boolean }) {
  const file = useQuery(api.evidence.get, { evidenceId: id as Id<"evidence"> });
  const [error, setError] = useState("");
  if (file === undefined) return <InlineSkeleton label="Loading attachment" />;
  if (file === null) return <Notice tone="warning">This attachment is unavailable or private.</Notice>;
  return <View style={{ backgroundColor: colors.soft, padding: 12, borderRadius: 10, gap: 8 }}>{file.contentType?.startsWith("image/") && file.url && <ProgressiveImage uri={file.url} style={{ width: "100%", height: 140, borderRadius: 8 }} resizeMode="contain" accessibilityLabel={file.filename} />}{!minimal && <ExpandableText numberOfLines={2} style={s.hint}>{file.filename} · {Math.ceil((file.size || 0) / 1024)} KB</ExpandableText>}{file.url && !minimal ? <Button title="Open attachment" icon={<ExternalLink size={15} color={colors.text} />} small variant="ghost" onPress={() => void Linking.openURL(file.url!).catch(e => setError(errorMessage(e)))} /> : !file.url ? <Notice tone="warning">This attachment is currently unavailable.</Notice> : null}{error !== "" && <Notice tone="error">{error}</Notice>}</View>;
}
export function EvidenceGallery({ ids }: { ids: string[] }) { return <View style={{ gap: 12 }}>{ids.map(id => <EvidenceItem key={id} id={id} />)}</View>; }
