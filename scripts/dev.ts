import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { childPath, portInUse, resolveNode, selectedWorkspaces, WORKSPACES } from "./dev-runtime";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children: ChildProcess[] = [];
let closing = false;
let resultCode = 0;
let forceTimer: ReturnType<typeof setTimeout> | undefined;
function signalChild(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") console.error("Could not stop child:", (error as Error).message); }
}
function stop(code: number) {
  if (closing) return;
  closing = true; resultCode = code;
  console.log("\n[passenger] Stopping all processes started by this command…");
  for (const child of children) signalChild(child, "SIGTERM");
  forceTimer = setTimeout(() => { for (const child of children) signalChild(child, "SIGKILL"); process.exit(resultCode); }, 5000);
  forceTimer.unref();
}
try {
  const args = process.argv.slice(2);
  const selected = selectedWorkspaces(args);
  const node = resolveNode();
  console.log(`[passenger] Node ${node.version} (${node.binary})`);
  console.log(`[passenger] Bun ${Bun.version}; shared dependency root: ${root}/node_modules`);
  for (const name of selected) console.log(`[passenger] ${WORKSPACES[name].label}: ${WORKSPACES[name].directory}`);
  if (args.includes("--check")) {
    console.log("[passenger] Runtime preflight passed. No services were started.");
  } else {
    const occupied: string[] = [];
    for (const name of selected) if (await portInUse(WORKSPACES[name].port)) occupied.push(`${WORKSPACES[name].label} port ${WORKSPACES[name].port}`);
    if (selected.includes("backend") && await portInUse(3211)) occupied.push("Convex HTTP actions port 3211");
    if (occupied.length) throw new Error(`Already running: ${occupied.join(", ")}. Stop the existing workspace command first (Ctrl+C). Passenger will not kill unrelated processes or launch duplicate backends.`);
    process.on("SIGINT", () => stop(0));
    process.on("SIGTERM", () => stop(0));
    const env = { ...process.env, PATH: childPath(node.binary, process.execPath), PASSENGER_NODE_BINARY: node.binary };
    for (const name of selected) {
      const child = spawn(process.execPath, ["run", "dev"], { cwd: resolve(root, WORKSPACES[name].directory), env, stdio: ["ignore", "inherit", "inherit"], detached: process.platform !== "win32" });
      children.push(child);
      child.on("error", error => { console.error(`[passenger] ${name}: ${error.message}`); stop(1); });
      child.on("exit", (code, signal) => {
        if (!closing) { console.error(`[passenger] ${name} stopped (${signal ?? code ?? "unknown"}). Shutting down sibling services.`); stop(code || 1); }
        if (children.every(p => p.exitCode !== null || p.signalCode !== null)) { if (forceTimer) clearTimeout(forceTimer); process.exitCode = resultCode; }
      });
    }
  }
} catch (error) { console.error(`\n[passenger] ${(error as Error).message}`); process.exitCode = 1; }
