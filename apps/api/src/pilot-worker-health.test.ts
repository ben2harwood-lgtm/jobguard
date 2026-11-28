import { once, EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { WorkerEvents } from "graphile-worker";
import { pilotWorkerHealth, pilotWorkerHeartbeat, workerHeartbeatTimeoutMs } from "./pilot-worker-health.js";

describe("pilot worker health", () => {
  it("beats after successful queue activity and expires without it", () => {
    const events = new EventEmitter();
    let now = 0;
    const healthy = pilotWorkerHeartbeat(events as WorkerEvents, () => now);
    expect(healthy()).toBe(false);
    events.emit("worker:getJob:error");
    expect(healthy()).toBe(false);
    events.emit("worker:getJob:empty");
    expect(healthy()).toBe(true);
    now += workerHeartbeatTimeoutMs;
    expect(healthy()).toBe(false);
    events.emit("job:complete");
    expect(healthy()).toBe(true);
  });

  it("exposes only queue flags and keeps queue errors private", async () => {
    let queueAvailable = true;
    let heartbeat = true;
    const server = pilotWorkerHealth(() => heartbeat, async () => {
      if (!queueAvailable) throw new Error("fictional private message");
      return { backlog: true, failed: false };
    });
    server.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
      const url = `http://127.0.0.1:${address.port}/healthz`;
      const ready = await fetch(url);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ heartbeat: true, queueAvailable: true, backlog: true, failed: false });
      heartbeat = false;
      expect((await fetch(url)).status).toBe(503);
      queueAvailable = false;
      const unavailable = await fetch(url);
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toEqual({ heartbeat: false, queueAvailable: false });
    } finally {
      server.close();
      server.closeAllConnections();
    }
  });
});
