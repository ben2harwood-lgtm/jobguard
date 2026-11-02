import { describe, expect, it } from "vitest";
import { FINAL_CHECK_EMPTY_TEXT, FINAL_CHECK_RUNNING_TEXT, finalCheckCatchV1, finalCheckDispositionV1 } from "@jobguard/core";
import { catchCommand, dispositionCommand, finalCheckReadV1, referenceChoices, revealStatus, type LockedLine } from "./final-check-reveal-view";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lines: LockedLine[] = [
 { id: id(1), kind: "baseline", scopeItemId: id(11), description: "Paint walls" },
 { id: id(2), kind: "variation", scopeItemId: id(12), description: "Extra socket" },
];
const revealed = { signalId: id(5), signalRevision: 1, description: "Outside tap", evidence: [{ id: id(6), receivedAt: "2026-10-01T09:00:00.000000Z", source: "completion_photo" }],
 comparisons: { lockedLineIds: [id(1), id(2)], baselineItemIds: [id(11)] }, disposition: null, answer: null };
const completed = finalCheckReadV1.parse({ state: "completed", lockId: id(7), runId: id(8), items: [revealed], lockedLines: lines });

describe("final check reveal view", () => {
 it("states each phase, including the exact zero-result sentence", () => {
  expect(revealStatus(finalCheckReadV1.parse({ state: "pending", items: [] }))).toBe(FINAL_CHECK_RUNNING_TEXT);
  expect(revealStatus(finalCheckReadV1.parse({ state: "completed", lockId: id(7), runId: id(8), items: [] }))).toBe(FINAL_CHECK_EMPTY_TEXT);
  expect(revealStatus(completed)).toBe("JobGuard's final check found 1 thing that may be missing from your bill.");
 });
 it("already included offers every locked line; original quote offers baseline scope items only", () => {
  expect(referenceChoices("already_included", lines)).toEqual([{ value: id(1), label: "Paint walls" }, { value: id(2), label: "Extra socket" }]);
  expect(referenceChoices("in_original_scope", lines)).toEqual([{ value: id(11), label: "Paint walls" }]);
  expect(referenceChoices("not_completed", lines)).toEqual([]);
 });
 it("builds a strict disposition bound to lock, run and signal revision; non-reference answers drop the reference", () => {
  const included = dispositionCommand(completed, completed.items[0]!, "already_included", id(1), id(9));
  expect(finalCheckDispositionV1.parse(included)).toEqual({ version: "final-check.disposition.v1", commandId: id(9), lockId: id(7), runId: id(8), signalId: id(5), expectedSignalRevision: 1, answer: "already_included", referenceId: id(1) });
  expect(dispositionCommand(completed, completed.items[0]!, "not_completed", id(1), id(9)).referenceId).toBeNull();
 });
 it("builds a strict catch confirmation bound to lock, run and signal revision", () => {
  expect(finalCheckCatchV1.parse(catchCommand(completed, completed.items[0]!, id(9)))).toEqual({ version: "final-check.catch.v1", commandId: id(9), lockId: id(7), runId: id(8), signalId: id(5), expectedSignalRevision: 1 });
 });
});
