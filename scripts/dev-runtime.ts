import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";

export const WORKSPACES = {
  admin: { directory: "apps/admin", port: 3000, label: "Next.js admin" },
  mobile: { directory: "apps/mobile", port: 8081, label: "Expo / Metro" },
  backend: { directory: "packages/backend", port: 3210, label: "Convex local backend" },
} as const;
export type WorkspaceName = keyof typeof WORKSPACES;
export function selectedWorkspaces(args: string[]): WorkspaceName[] {
  const requested = args.filter(a => a !== "--check");
  if (!requested.length || (requested.length === 1 && requested[0] === "all")) return ["admin", "mobile", "backend"];
  if (requested.length !== 1 || !(requested[0]! in WORKSPACES)) throw new Error("Usage: bun dev [all|admin|mobile|backend] [--check]");
  return [requested[0] as WorkspaceName];
}
export function supportedNode(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return false;
  const major = Number(match[1]); const minor = Number(match[2]);
  return (major === 20 && minor >= 19) || (major === 22 && minor >= 13) || major === 24;
}
export function nodeVersion(binary: string): string | null {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 5000, env: process.env });
  return result.status === 0 ? result.stdout.trim() : null;
}
export function resolveNode(env: NodeJS.ProcessEnv = process.env): { binary: string; version: string } {
  if (env.PASSENGER_NODE_BINARY) {
    const version = nodeVersion(env.PASSENGER_NODE_BINARY);
    if (!version || !supportedNode(version)) throw new Error("PASSENGER_NODE_BINARY must point to Node 20.19+, 22.13+, or 24. Convex local Node actions do not support Node 26.");
    return { binary: env.PASSENGER_NODE_BINARY, version };
  }
  const candidates: string[] = [];
  // Prefer an existing supported PATH runtime without changing the global shell default.
  for (const directory of (env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) if (directory) candidates.push(join(directory, process.platform === "win32" ? "node.exe" : "node"));
  const nvm = join(env.NVM_DIR || join(env.HOME || "", ".nvm"), "versions", "node");
  if (existsSync(nvm)) {
    const versions = readdirSync(nvm).filter(v => supportedNode(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) candidates.push(join(nvm, version, "bin", "node"));
  }
  for (const binary of new Set(candidates)) {
    if (!existsSync(binary)) continue;
    const version = nodeVersion(binary);
    if (version && supportedNode(version)) return { binary, version };
  }
  throw new Error("Passenger needs Node 20.19+, 22.13+, or 24 for Expo and Convex Node actions. Install one (e.g. nvm install 22), then rerun bun dev. Your current Node default is not changed by this launcher.");
}
export function childPath(node: string, bun: string, current = process.env.PATH ?? "") {
  return [dirname(node), dirname(bun), current].join(process.platform === "win32" ? ";" : ":");
}
export function portInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const settle = (busy: boolean) => { socket.destroy(); resolve(busy); };
    socket.setTimeout(800);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.once("timeout", () => settle(false));
  });
}
