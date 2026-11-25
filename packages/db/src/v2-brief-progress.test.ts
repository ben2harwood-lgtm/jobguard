import { describe, expect, it } from "vitest";
import { briefProgressCommandV1 } from "./v2-brief-progress-repository.js";
const command = { version: "v2-brief-progress-command.v1", commandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  trade: "tiler", briefVersion: 1, scopeItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", taskKey: "tile-splashback",
  expectedVersion: 0, kind: "done", note: "" };
describe("V2-F1 command boundary", () => {
  it.each(["done", "blocked", "changed"])("validates %s and requires explanation for blocked/changed", kind => {
    expect(briefProgressCommandV1.safeParse({ ...command, kind, note: "Site observation" }).success).toBe(true);
    expect(briefProgressCommandV1.safeParse({ ...command, kind, note: " " }).success).toBe(kind === "done");
  });
  it.each([{ taskKey: "" }, { briefVersion: 0 }, { expectedVersion: -1 }, { expectedVersion: 0.5 },
    { actorMembershipId: command.commandId }, { photoReference: command.commandId }, { tenantId: command.commandId },
    { kind: "completed" }, { note: "a\0b" }, { note: "a".repeat(2001) }])("refuses invalid or authoritative input %j", fields => {
    expect(briefProgressCommandV1.safeParse({ ...command, ...fields }).success).toBe(false);
  });
});
