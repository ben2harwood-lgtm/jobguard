import { describe, expect, it } from "vitest";
import { briefProgressCommandV1, briefProgressCommandV2, briefProgressCommand, briefProgressPhotoCommandV1 } from "./v2-brief-progress-repository.js";
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


describe("V2-F1-P photo command boundary", () => {
  it("retains v1 and supports optional v2 photos for every kind", () => {
    expect(briefProgressCommand.safeParse(command).success).toBe(true);
    expect(briefProgressCommandV1.safeParse({ ...command, photoId: command.commandId }).success).toBe(false);
    for (const kind of ["done", "blocked", "changed"]) {
      const v2 = { ...command, version: "v2-brief-progress-command.v2", kind, note: "no power" };
      expect(briefProgressCommandV2.safeParse(v2).success).toBe(true);
      expect(briefProgressCommand.safeParse({ ...v2, photoId: command.commandId }).success).toBe(true);
      for (const photoId of [null, "invalid", 12]) expect(briefProgressCommand.safeParse({ ...v2, photoId }).success).toBe(false);
    }
  });
  it("accepts only generated photo fixtures, without caller authority", () => {
    const photo = { version: "v2-brief-progress-photo-command.v1", commandId: command.commandId,
      scopeItemId: command.scopeItemId, fixture: "completion-photo" };
    expect(briefProgressPhotoCommandV1.safeParse(photo).success).toBe(true);
    for (const fields of [{ fixture: "camera" }, { bytes: "real photo" }, { actorId: command.commandId }, { tenantId: command.commandId }]) {
      expect(briefProgressPhotoCommandV1.safeParse({ ...photo, ...fields }).success).toBe(false);
    }
  });
});
