import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharedEnvPath = resolve(root, ".env.shared.local");

type Target = { file: string; key: string };

const targets: Target[] = [
  { file: resolve(root, "apps/mobile/.env.local"), key: "EXPO_PUBLIC_CONVEX_URL" },
  { file: resolve(root, "apps/admin/.env.local"), key: "NEXT_PUBLIC_CONVEX_URL" },
  { file: resolve(root, "apps/website/.env.local"), key: "NEXT_PUBLIC_CONVEX_URL" },
];

const sharedExamplePath = resolve(root, ".env.shared.example");

if (!existsSync(sharedEnvPath)) {
  if (process.env.PASSENGER_PUBLIC_CONVEX_URL?.trim()) {
    writeFileSync(sharedEnvPath, `PASSENGER_PUBLIC_CONVEX_URL=${process.env.PASSENGER_PUBLIC_CONVEX_URL.trim()}\n`, "utf8");
    console.log("[passenger] Created .env.shared.local from PASSENGER_PUBLIC_CONVEX_URL environment variable.");
  } else if (existsSync(sharedExamplePath)) {
    const exampleContent = readFileSync(sharedExamplePath, "utf8");
    writeFileSync(sharedEnvPath, exampleContent, "utf8");
    console.log("[passenger] Initialized .env.shared.local from .env.shared.example.");
  } else {
    writeFileSync(sharedEnvPath, "PASSENGER_PUBLIC_CONVEX_URL=http://127.0.0.1:3210\n", "utf8");
    console.log("[passenger] Initialized .env.shared.local with default local URL (http://127.0.0.1:3210).");
  }
}

const sharedEnv = parseEnv(readFileSync(sharedEnvPath, "utf8"));
const publicConvexUrl = sharedEnv.PASSENGER_PUBLIC_CONVEX_URL?.trim() || process.env.PASSENGER_PUBLIC_CONVEX_URL?.trim() || "http://127.0.0.1:3210";

validateUrl(publicConvexUrl);

for (const target of targets) {
  const current = existsSync(target.file) ? readFileSync(target.file, "utf8") : "";
  writeFileSync(target.file, upsertEnv(current, target.key, publicConvexUrl), "utf8");
}

console.log(`[passenger] Synced public Convex URL to mobile, admin, and website: ${publicConvexUrl}`);

function parseEnv(source: string) {
  const values: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    values[key] = value;
  }
  return values;
}

function upsertEnv(source: string, key: string, value: string) {
  const lines = source === "" ? [] : source.replace(/\r\n/g, "\n").split("\n");
  let replaced = false;
  const next = lines.map(line => {
    if (new RegExp(`^\\s*${escapeRegExp(key)}=`).test(line)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) next.push(`${key}=${value}`);
  return next.filter((line, index, array) => !(line === "" && index === array.length - 1)).join("\n") + "\n";
}

function validateUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("PASSENGER_PUBLIC_CONVEX_URL must be a valid http(s) URL."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("PASSENGER_PUBLIC_CONVEX_URL must use http or https.");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
