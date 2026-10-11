import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { freePort } from "./pool-test-utils.js";

const open: Server[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
const occupy = (port: number, host: string) => new Promise<void>((resolve, reject) => { const server = createServer(); open.push(server); server.once("error", reject); server.listen({ host, port }, () => resolve()); });
const anyFree = async () => { const probe = createServer(); await new Promise<void>(resolve => probe.listen({ host: "127.0.0.1", port: 0 }, () => resolve())); const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve())); return port; };

describe("freePort for embedded test clusters", () => {
  it("skips a port another process is listening on (other tools sit inside the test port ranges)", async () => {
    const taken = await anyFree(); await occupy(taken, "127.0.0.1");
    for (let i = 0; i < 20; i++) expect(await freePort(taken, 2)).toBe(taken + 1);
  });
  it("gives up with a clear error when every port in the range is in use", async () => {
    const taken = await anyFree(); await occupy(taken, "127.0.0.1");
    await expect(freePort(taken, 1)).rejects.toThrow(`no free port in ${taken}..${taken + 1}`);
  });
});
