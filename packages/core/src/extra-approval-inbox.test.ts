import { describe, expect, it } from "vitest";
import { extraApprovalInboxFindings, type ExtraApprovalInboxRow } from "./extra-approval-inbox.js";
import { groupInbox, type InboxFinding } from "./inbox-relevance.js";

const row: ExtraApprovalInboxRow = { job_id: "job-a", variation_id: "extra-a", request_id: "request-a", step_index: 0 };
describe("waiting extra approval inbox projection", () => {
  it("keeps every request mandatory at zero budget, among many advisory findings", () => {
    const waiting = extraApprovalInboxFindings([row, { ...row, variation_id: "extra-b", request_id: "request-b" }]);
    const advisory: InboxFinding[] = Array.from({ length: 200 }, (_, i) => ({ ...waiting[0]!, findingId: `advisory-${i}`, lane: "advisory", sourceRevision: String(i) }));
    for (const budget of [0, 1, 200]) {
      const grouped = groupInbox([...advisory, ...waiting], budget);
      expect(grouped.mandatory).toHaveLength(2);
      expect(grouped.mandatory.flatMap(item => item.sources)).toEqual(["#extra-extra-a", "#extra-extra-b"]);
    }
  });
  it("drops prices and all other queue fields rather than copying them", () => {
    const findings = extraApprovalInboxFindings([{ ...row, net_pence: "987654", escalated: true, overdue: true } as ExtraApprovalInboxRow]);
    expect(findings[0]?.amount).toBeNull();
    expect(JSON.stringify(findings)).not.toMatch(/987654|net_pence|escalated|overdue/);
  });
  it("coalesces replayed reads while keeping different requests and steps distinct", () => {
    expect(groupInbox(extraApprovalInboxFindings([row, row]), 0).mandatory).toHaveLength(1);
    const revised = { ...row, request_id: "request-new" };
    expect(groupInbox(extraApprovalInboxFindings([row, revised, { ...row, step_index: 1 }]), 0).mandatory).toHaveLength(3);
    // A fresh queue replaces the previous read; the adapter never caches the old revision.
    expect(extraApprovalInboxFindings([revised]).map(item => item.sourceRevision)).toEqual(["request-new:0"]);
  });
  it("shows no items for an empty authorized queue, and retains no decided items", () => {
    expect(groupInbox(extraApprovalInboxFindings([]), 0).mandatory).toEqual([]);
    expect(extraApprovalInboxFindings([row])).toHaveLength(1);
    expect(extraApprovalInboxFindings([])).toEqual([]);
  });
});
