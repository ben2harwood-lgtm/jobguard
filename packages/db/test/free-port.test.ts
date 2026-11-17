import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { freePort } from "./pool-test-utils.js";

const open: Server[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
const occupy = (port: number, host: string) => new Promise<number>((resolve, reject) => { const server = createServer(); open.push(server); server.once("error", reject); server.listen({ host, port }, () => resolve((server.address() as { port: number }).port)); });
const canListen = (host: string, port: number) => new Promise<boolean>(resolve => {
  const server = createServer();
  server.once("error", (error: NodeJS.ErrnoException) => resolve(host === "::1" && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")));
  server.listen({ host, port }, () => server.close(() => resolve(true)));
});
const occupyWithFreeNeighbour = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = await occupy(0, "127.0.0.1");
    if (port < 65535 && await canListen("127.0.0.1", port + 1) && await canListen("::1", port + 1)) return port;
  }
  throw new Error("could not find a held port with a free neighbour on both loopbacks in 20 tries");
};

describe("freePort for embedded test clusters", () => {
  it("skips a port another process is listening on (other tools sit inside the test port ranges)", async () => {
    const taken = await occupyWithFreeNeighbour();
    for (let i = 0; i < 20; i++) expect(await freePort(taken, 2)).toBe(taken + 1);
  });
  it("gives up with a clear error when every port in the range is in use", async () => {
    const taken = await occupy(0, "127.0.0.1");
    await expect(freePort(taken, 1)).rejects.toThrow(`no free port in ${taken}..${taken + 1}`);
  });
});
