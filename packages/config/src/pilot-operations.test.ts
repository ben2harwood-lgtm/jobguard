import { expect, it } from "vitest";
import { parsePilotOperations } from "./pilot-operations.js";

it("keeps existing workers compatible and parses explicit pilot monitoring settings", () => {
  expect(parsePilotOperations({})).toEqual({ PILOT_QUEUE_BACKLOG_SECONDS: 300 });
  expect(parsePilotOperations({ PILOT_WORKER_HEALTH_PORT: "7308", PILOT_QUEUE_BACKLOG_SECONDS: "30" }))
    .toEqual({ PILOT_WORKER_HEALTH_PORT: 7308, PILOT_QUEUE_BACKLOG_SECONDS: 30 });
  expect(() => parsePilotOperations({ PILOT_WORKER_HEALTH_PORT: "fictional secret" }))
    .toThrow(/^PILOT_OPERATIONS_CONFIG_REFUSED$/u);
});
