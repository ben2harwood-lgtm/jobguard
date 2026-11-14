import { describe, expect, it } from "vitest";
import { proofCommandV1 } from "./contracts.js";

describe("explicit practice proof statement boundary", () => {
 const command = { version: "practice-proof-command.v1", action: "answer_statement", commandId: "40000000-0000-4000-8000-000000000004" };
 it.each([true, false])("accepts only a supplied boolean: %s", includesElectricalWork => {
  expect(proofCommandV1.parse({ ...command, includesElectricalWork })).toEqual({ ...command, includesElectricalWork });
 });
 it.each([{}, { includesElectricalWork: "No" }, { includesElectricalWork: null }, { includesElectricalWork: 0 },
  { includesElectricalWork: false, membershipId: command.commandId }, { includesElectricalWork: false, recordedAt: "2026-11-11" },
  { includesElectricalWork: false, trade: "decorating" }, { includesElectricalWork: false, requiredEvidenceType: "completion_photo" }])("rejects missing, inferred and caller-owned authority: %j", patch => {
  expect(proofCommandV1.safeParse({ ...command, ...patch }).success).toBe(false);
 });
 it("keeps legacy upload, finalize and completion payloads valid without a statement", () => {
  for (const action of [
   { action: "select_generated", scopeItemId: command.commandId, fixture: "completion-photo" },
   { action: "finalize", uploadId: command.commandId, objectVersionId: "fictional-v1" },
   { action: "complete", scopeItemId: command.commandId, evidenceId: command.commandId },
  ]) expect(proofCommandV1.safeParse({ version: command.version, commandId: command.commandId, ...action }).success).toBe(true);
 });
});
