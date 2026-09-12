import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { childPath, findAvailablePort, portInUse, resolveNode, selectedWorkspaces, WORKSPACES, type WorkspaceName } from "./dev-runtime";

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
    const allocatedPorts: Partial<Record<WorkspaceName, number>> = {};
    const reservedPorts = new Set<number>();
    for (const name of selected) reservedPorts.add(WORKSPACES[name].port);

    for (const name of selected) {
      reservedPorts.delete(WORKSPACES[name].port);
      const port = await findAvailablePort(WORKSPACES[name].port, reservedPorts);
      reservedPorts.add(port);
      allocatedPorts[name] = port;
      if (port !== WORKSPACES[name].port) {
        console.log(`[passenger] ${WORKSPACES[name].label} default port ${WORKSPACES[name].port} is in use; using port ${port}.`);
      }
    }

    process.on("SIGINT", () => stop(0));
    process.on("SIGTERM", () => stop(0));
    const baseEnv = { ...process.env, PATH: childPath(node.binary, process.execPath), PASSENGER_NODE_BINARY: node.binary };
    for (const name of selected) {
      const port = allocatedPorts[name];
      const childEnv: Record<string, string | undefined> = {
        ...baseEnv,
        PORT: port ? String(port) : undefined,
      };
      const devArgs = ["run", "dev"];
      if (port) {
        if (name === "admin" || name === "website") {
          devArgs.push("--", "-p", String(port));
        } else if (name === "mobile") {
          childEnv.RCT_METRO_PORT = String(port);
          devArgs.push("--", "--port", String(port));
        }
      }

      const child = spawn(process.execPath, devArgs, { cwd: resolve(root, WORKSPACES[name].directory), env: childEnv, stdio: ["ignore", "inherit", "inherit"], detached: process.platform !== "win32" });
      children.push(child);
      child.on("error", error => { console.error(`[passenger] ${name}: ${error.message}`); stop(1); });
      child.on("exit", (code, signal) => {
        if (!closing) { console.error(`[passenger] ${name} stopped (${signal ?? code ?? "unknown"}). Shutting down sibling services.`); stop(code || 1); }
        if (children.every(p => p.exitCode !== null || p.signalCode !== null)) { if (forceTimer) clearTimeout(forceTimer); process.exitCode = resultCode; }
      });
    }
  }
} catch (error) { console.error(`\n[passenger] ${(error as Error).message}`); process.exitCode = 1; }
