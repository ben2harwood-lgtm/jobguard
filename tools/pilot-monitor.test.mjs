import assert from "node:assert/strict";
import { test } from "node:test";
import { workerAlerts } from "./pilot-monitor.mjs";

test("pilot monitor classifies missing, degraded and healthy worker probes", () => {
  assert.deepEqual(workerAlerts(), ["worker.heartbeat_missed"]);
  assert.deepEqual(workerAlerts({ heartbeat: true }), ["worker.heartbeat_missed"]);
  assert.deepEqual(workerAlerts({ heartbeat: false, queueAvailable: false }),
    ["worker.heartbeat_missed", "worker.queue_unavailable"]);
  assert.deepEqual(workerAlerts({ heartbeat: false, queueAvailable: true, backlog: true, failed: true, error: "private" }),
    ["worker.heartbeat_missed", "worker.queue_backlog", "worker.queue_failed"]);
  assert.deepEqual(workerAlerts({ heartbeat: true, queueAvailable: true, backlog: false, failed: false }), []);
});
