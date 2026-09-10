import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { childPath, portInUse, selectedWorkspaces, supportedNode } from "./dev-runtime";

describe("shared dev supervisor", () => {
  test("defaults to all three business workspaces", () => expect(selectedWorkspaces([])).toEqual(["admin", "mobile", "backend"]));
  test("all alias selects same services", () => expect(selectedWorkspaces(["all"])).toEqual(selectedWorkspaces([])));
  test("supports isolated service checks", () => expect(selectedWorkspaces(["mobile", "--check"])).toEqual(["mobile"]));
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
});
