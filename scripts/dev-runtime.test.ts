import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { childPath, findAvailablePort, portInUse, selectedWorkspaces, supportedNode } from "./dev-runtime";

describe("shared dev supervisor", () => {
  test("defaults to all three business workspaces", () => expect(selectedWorkspaces([])).toEqual(["admin", "mobile", "backend"]));
  test("all alias selects same services", () => expect(selectedWorkspaces(["all"])).toEqual(selectedWorkspaces([])));
  test("supports isolated service checks", () => expect(selectedWorkspaces(["mobile", "--check"])).toEqual(["mobile"]));
  test("supports website workspace check", () => expect(selectedWorkspaces(["website", "--check"])).toEqual(["website"]));
  test("rejects an unknown surface rather than silently omitting backend", () => expect(() => selectedWorkspaces(["unknown"])).toThrow("Usage"));
  test("rejects conflicting selections", () => expect(() => selectedWorkspaces(["mobile", "backend"])).toThrow("Usage"));
  for (const version of ["v20.19.0", "v22.13.1", "v24.1.0"]) test(`accepts ${version}`, () => expect(supportedNode(version)).toBe(true));
  for (const version of ["v18.20.7", "v20.18.0", "v22.12.0", "v26.7.0", "invalid"]) test(`rejects ${version}`, () => expect(supportedNode(version)).toBe(false));
  test("prepends supported Node and Bun paths without changing machine default", () => expect(childPath("/runtime/node", "/bun/bin/bun", "/usr/bin")).toBe("/runtime:/bun/bin:/usr/bin"));
  test("detects an occupied port without terminating its listener", async () => {
    const server = createServer(socket => socket.end());
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    try { expect(await portInUse(address.port)).toBe(true); expect(server.listening).toBe(true); }
    finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    expect(await portInUse(address.port)).toBe(false);
  });
  test("finds the next available port when the initial port is occupied", async () => {
    const server = createServer(socket => socket.end());
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    try {
      const port = await findAvailablePort(address.port);
      expect(port).toBeGreaterThan(address.port);
      expect(await portInUse(port)).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
  test("skips reserved ports when finding available port", async () => {
    const startPort = 42000;
    const reserved = new Set<number>([startPort, startPort + 1]);
    const port = await findAvailablePort(startPort, reserved);
    expect(port).toBeGreaterThanOrEqual(startPort + 2);
    expect(reserved.has(port)).toBe(false);
  });
});
