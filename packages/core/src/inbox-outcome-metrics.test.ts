import { describe, expect, it } from "vitest";
import { inboxOutcomeMetrics, type InboxMetricEvent } from "./inbox-outcome-metrics.js";
import { groupInbox, type InboxFinding } from "./inbox-relevance.js";
import { money, MAX_MONEY_PENCE } from "./money.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { version: "inbox-metrics.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2), asOf: "2026-01-01T01:00:00Z" };
const base = { tenantId: id(1), jobId: id(2), ruleId: "proof", ruleVersion: "v1", occurredAt: "2026-01-01T00:00:00Z" };
const finding = (n = 10): InboxMetricEvent => ({ ...base, eventId: id(n), commandId: id(n + 100), kind: "finding", findingId: id(n + 200) });
const decision: InboxMetricEvent = { ...base, eventId: id(20), commandId: id(120), kind: "decision", decisionId: id(220), findingIds: [id(210), id(211)] };
const resolution: InboxMetricEvent = { ...base, eventId: id(30), commandId: id(130), kind: "resolution", decisionId: id(220), resolution: "confirmed", reason: "useful", occurredAt: "2026-01-01T00:01:00Z" };
const later: InboxMetricEvent = { ...base, eventId: id(40), commandId: id(140), kind: "later_outcome", decisionId: id(220), outcome: "useful", occurredAt: "2026-01-01T00:02:00Z" };
const events = [finding(), finding(11), finding(12), decision, resolution];
const read = (input: unknown = events) => inboxOutcomeMetrics(scope, input).byRule[0];

describe("dark M2-7 per-rule outcome read", () => {
  it("measures conversion, coalescing, confirmation, reasons, latency and signal/noise without content", () => {
    expect(read()).toEqual({ ruleId: "proof", ruleVersion: "v1", findings: 3, decisions: 1,
      convertedFindings: 2, findingToDecisionRate: 2 / 3, coalescedCount: 1, confirmed: 1, dismissed: 0,
      reasons: { useful: 1, already_handled: 0, incorrect: 0, not_relevant: 0, duplicate: 0 }, meanTimeToDecisionMs: 60000,
      laterOutcomes: { useful: 0, no_issue: 0, cancelled: 0, reversed: 0 },
      signalToNoise: { signal: 1, noise: 0, confirmedShare: 1 } });
    expect(read(events.slice(0, 4))?.signalToNoise.confirmedShare).toBeNull();
  });
  it("counts dismissal reasons separately and isolates rule versions", () => {
    const dismissed = { ...resolution, resolution: "dismissed", reason: "duplicate" };
    const output = inboxOutcomeMetrics(scope, [...events.slice(0, 4), dismissed,
      { ...finding(50), ruleVersion: "v2" }]);
    expect(output.byRule).toHaveLength(2);
    expect(output.byRule[0]).toMatchObject({ dismissed: 1, reasons: { duplicate: 1 }, signalToNoise: { confirmedShare: 0 } });
    expect(output.byRule[1]).toMatchObject({ findings: 1, decisions: 0, meanTimeToDecisionMs: null });
  });
  it("dedupes exact command and event replays; rejects changed payload or reused identity", () => {
    expect(read([...events, ...events])).toEqual(read());
    for (const changed of [{ ...resolution, reason: "incorrect" }, { ...resolution, eventId: id(99) },
      { ...resolution, commandId: id(99) }]) {
      expect(() => read([...events, changed])).toThrow("IDEMPOTENCY_CONFLICT");
    }
    expect(() => read([...events, { ...resolution, eventId: id(99), commandId: id(199) }])).toThrow("INVALID_METRICS_REFERENCE");
  });
  it("uses event time for cancellations/reversals, even when delivered first, without changing historic confirmation", () => {
    for (const outcome of ["cancelled", "reversed"] as const) {
      const reversal = { ...later, eventId: id(41), commandId: id(141), outcome, occurredAt: "2026-01-01T00:03:00Z" };
      expect(read([reversal, later, ...events])).toEqual(read([...events, later, reversal]));
      expect(read([reversal, later, ...events])).toMatchObject({ confirmed: 1, laterOutcomes: { useful: 0, [outcome]: 1 } });
      expect(inboxOutcomeMetrics({ ...scope, asOf: "2026-01-01T00:02:30Z" }, [...events, later, reversal]).byRule[0]?.laterOutcomes.useful).toBe(1);
    }
  });
  it("rejects ambiguous outcome timestamps in every delivery order", () => {
    const conflicting = { ...later, eventId: id(41), commandId: id(141), outcome: "reversed" };
    const newest = { ...later, eventId: id(42), commandId: id(142), occurredAt: "2026-01-01T00:04:00Z" };
    for (const sequence of [[newest, later, conflicting], [later, newest, conflicting], [conflicting, later, newest]]) {
      expect(() => read([...events, ...sequence])).toThrow("INVALID_METRICS_REFERENCE");
    }
  });
  it("never borrows findings or decisions across tenants, jobs or rule versions", () => {
    for (const change of [{ tenantId: id(9) }, { jobId: id(9) }, { ruleVersion: "v2" }]) {
      expect(() => read([{ ...finding(), ...change }, ...events.slice(1)])).toThrow("INVALID_METRICS_REFERENCE");
      expect(() => read([...events, { ...later, decisionId: id(999) }])).toThrow("INVALID_METRICS_REFERENCE");
    }
    expect(read([...events, { ...later, tenantId: id(9) }, { ...later, jobId: id(9) }])).toEqual(read());
  });
  it("rejects live, hidden and free-text inputs with generic errors and no sensitive values", () => {
    expect(() => inboxOutcomeMetrics({ ...scope, environment: "production" }, events)).toThrow("INVALID_METRICS_INPUT");
    for (const field of ["message", "shadowSignalId", "secret", "lockedBillId", "finalAccountRevisionId", "amountPence"]) {
      expect(() => read([{ ...finding(), [field]: "private@example.invalid" }])).toThrow(/^INVALID_METRICS_INPUT$/);
    }
    expect(() => read([{ ...finding(), occurredAt: "not-a-date" }])).toThrow("INVALID_METRICS_INPUT");
    expect(() => read([...events, { ...later, occurredAt: "2025-01-01T00:00:00Z" }])).toThrow("INVALID_METRICS_REFERENCE");
  });
  it("never suppresses mandatory proof/approval/blockers under zero advisory budget or money extremes", () => {
    const amounts = [null, money(0), money(-1), money(1), money(MAX_MONEY_PENCE)];
    const findings: InboxFinding[] = amounts.map((amount, i) => ({ findingId: id(i), findingRevision: 1,
      jobId: id(2), lane: "mandatory", ruleId: `proof-${i}`, ruleRevision: "v1", action: "review",
      recipient: null, amount, sourceRevision: "v1", sourceReference: "fixture", title: "Proof required",
      explanation: "Recorded proof requirement", permittedAction: "Review" }));
    expect(groupInbox(findings, 0).mandatory).toHaveLength(amounts.length);
    expect(() => money(MAX_MONEY_PENCE + 1)).toThrow();
  });
});
