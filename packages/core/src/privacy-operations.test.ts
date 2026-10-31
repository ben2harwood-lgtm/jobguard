const uuid = "10000000-0000-4000-8000-000000000001";
import { describe, expect, it } from "vitest";
import { privacyCommandV1, privacyQueryV1 } from "./privacy-operations.js";
const open = { version: "privacy-command.v1", action: "open", commandId: uuid, subjectId: uuid, operation: "export" };
describe("privacy boundaries", () => {
  it("admits each operation and exact instruction binding", () => {
    for (const operation of ["access", "export", "delete"]) expect(privacyCommandV1.safeParse({ ...open, operation }).success).toBe(true);
    expect(privacyCommandV1.safeParse({ version: open.version, action: "instruct", commandId: uuid, requestId: uuid, expectedRevision: 0, instructionRef: uuid, instructionHash: "a".repeat(64) }).success).toBe(true);
  });
  it("rejects authority, tenant, actor and backup-erasure overrides", () => {
    for (const key of ["tenantId", "actorId", "approved", "realData", "backupsErased", "instruction"]) expect(privacyCommandV1.safeParse({ ...open, [key]: true }).success).toBe(false);
    expect(privacyCommandV1.safeParse({ ...open, operation: "erase_backups" }).success).toBe(false);
    expect(privacyQueryV1.safeParse({ version: "privacy-query.v1", requestId: uuid, tenantId: uuid }).success).toBe(false);
  });
  it("requires an exact revision and recorded instruction reference/hash", () => {
    const value = { version: open.version, action: "instruct", commandId: uuid, requestId: uuid, expectedRevision: 0, instructionRef: uuid, instructionHash: "a".repeat(64) };
    for (const key of ["expectedRevision", "instructionRef", "instructionHash"]) expect(privacyCommandV1.safeParse({ ...value, [key]: undefined }).success).toBe(false);
    expect(privacyCommandV1.safeParse({ ...value, expectedRevision: -1 }).success).toBe(false);
  });
});

describe("expanded DSAR boundaries", () => {
  it("requires versioned exact review evidence and keeps legacy commands narrow", async () => {
    const { privacyCommand, privacyCommandV2 } = await import("./privacy-operations.js");
    const review = { version: "privacy-command.v2", action: "review", commandId: uuid, requestId: uuid, expectedRevision: 1,
      identityRef: uuid, authorityRef: uuid, retentionReviewRef: uuid, reviewHash: "b".repeat(64) };
    expect(privacyCommand.safeParse(review).success).toBe(true);
    for (const key of ["identityRef", "authorityRef", "retentionReviewRef", "reviewHash"]) {
      expect(privacyCommandV2.safeParse({ ...review, [key]: undefined }).success).toBe(false);
    }
    expect(privacyCommandV2.safeParse({ ...review, tenantId: uuid }).success).toBe(false);
    expect(privacyCommandV1.safeParse({ ...open, operation: "offboard" }).success).toBe(false);
    expect(privacyCommandV2.safeParse({ ...open, version: "privacy-command.v2", operation: "offboard" }).success).toBe(true);
  });
});
