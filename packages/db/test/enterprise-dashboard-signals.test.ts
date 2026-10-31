import { expect, it } from "vitest";
import { billingInvoiceLineV1 } from "@jobguard/core";
import { scopedEnterpriseSignals } from "../src/enterprise-dashboard-signals.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-01T00:00:00Z", dims = { region: id(1), team: id(2), operative: id(3), client: id(4), contract: id(5) };
const query = { version: "enterprise-dashboard-query.v1", from: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
const facts = { version: "enterprise-dashboard-facts.v1", cutoff: "2026-10-28T00:00:00Z", extras: [],
  closeouts: Array.from({ length: 5 }, (_, i) => ({ jobId: id(6), sourceId: id(10 + i), at, dimensions: dims, answer: "no" })), billing: { status: "held", prerequisite: "ENT-6B" } };
const signals = { version: "enterprise-signal-facts.v1", extras: [], orderLines: [], billedVariations: [], closeouts: [], outlierPolicy: null };
it("derives cited explicit synthetic close-out observations without changing any input", () => {
  const before = JSON.stringify([facts, query, signals]);
  const result = scopedEnterpriseSignals(facts, query, signals);
  expect(result.observations.map(s => s.kind).sort()).toEqual(["no_closeout_observation"]);
  expect(result.observations.find(s => s.kind === "no_closeout_observation")?.sourceIds).toEqual(facts.closeouts.map(c => c.sourceId));
  expect(result.outliers.policy).toMatchObject({ minimumAnswered: 5, maximumNoRate: { numerator: 3, denominator: 4 } });
  expect(JSON.stringify([facts, query, signals])).toBe(before);
  expect(scopedEnterpriseSignals(facts, query, signals)).toEqual(result);
  expect(Object.keys(result.observations[0]!).sort()).toEqual(["extraIds", "id", "jobId", "kind", "sourceIds"]);
});
it("never leaks a comparison population outside the selected dimensions/window", () => {
  for (const q of [{ ...query, filters: { team: id(99) } }, { ...query, until: "2026-02-01T00:00:00Z" }]) {
    const result = scopedEnterpriseSignals(facts, q, signals);
    expect(result.observations).toEqual([]); expect(JSON.stringify(result)).not.toContain(id(10));
  }
  for (const q of [{ ...query, dimension: "operative" }, { ...query, filters: { operative: id(3) } }]) {
    expect(scopedEnterpriseSignals(facts, q, signals).observations.every(s => s.kind !== "billed_variation_without_extra")).toBe(true);
  }
});
it("requires the minimum answered sample and strict threshold; missing answers cannot create an outlier", () => {
  for (const closeouts of [facts.closeouts.slice(0, 4), facts.closeouts.map((c, i) => ({ ...c, answer: i > 2 ? "yes" : "no" })), facts.closeouts.map(c => ({ ...c, answer: null }))])
    expect(scopedEnterpriseSignals({ ...facts, closeouts }, query, signals).observations).toEqual([]);
});
it("rejects duplicate close-out source replays rather than double counting", () => {
  expect(() => scopedEnterpriseSignals({ ...facts, closeouts: [...facts.closeouts, facts.closeouts[0]] }, query, signals)).toThrow("DASHBOARD_INVALID");
});
it("does not turn supplied unconfigured billing sources into a successful stored signal feed", () => {
  const result = scopedEnterpriseSignals(facts, query, { ...signals, billingSource: "scoped_stored_other_lines", billedVariations: [{ jobId: id(6), sourceId: id(20), kind: "variation", extraId: null }] });
  expect(result.billing.status).toBe("held"); expect(result.observations.every(s => s.kind !== "billed_variation_without_extra")).toBe(true);
});

it("records the actual ENT-6 contract gap: an invoice extra with no export match is invalid", () => {
  const line = { externalInvoiceLineId: "fictional-unmatched", kind: "extra", existedAt: at, netPence: 100, vatPence: 20, grossPence: 120, match: null };
  expect(billingInvoiceLineV1.safeParse(line).success).toBe(false);
  expect(billingInvoiceLineV1.safeParse({ ...line, kind: "other" }).success).toBe(true);
});

const storedRow = { jobId: id(6), sourceId: id(30), runId: id(31), at, recordedAt: at, dimensions: { ...dims, operative: null },
  line: { externalInvoiceLineId: "fictional-other", kind: "other", existedAt: at, netPence: 100, vatPence: 20, grossPence: 120, match: null },
  billedNet: { numerator: "100", denominator: "1" }, creditedNet: { numerator: "0", denominator: "1" }, rejected: false, complete: true };
const billing = (rows: unknown[]) => ({ version: "enterprise-billed-signal-rows.v1", rows });
const observed = (rows = [storedRow], q = query) => scopedEnterpriseSignals({ ...facts, closeouts: [] }, q, signals, billing(rows));
it("only the unmatched variation line is advisory when matched and unmatched invoice lines coexist", () => {
  const matched = { ...storedRow, line: { ...storedRow.line, externalInvoiceLineId: "matched-extra", kind: "extra",
    match: { exportLineId: id(40), jobId: storedRow.jobId, extraId: id(41), scopeItemId: id(42), revisionId: id(43), revisionHash: "a".repeat(64) } } };
  // Use ENT-6's real boundary: a matched extra is valid, but is never a missing-extra observation.
  expect(billingInvoiceLineV1.safeParse(matched.line).success).toBe(true);
  expect(observed([matched]).observations).toEqual([]);
  const mixed = [matched, storedRow], before = JSON.stringify(mixed);
  const result = observed(mixed);
  expect(result).toEqual(observed([storedRow]));
  expect(observed([...mixed].reverse())).toEqual(result);
  expect(result.observations).toHaveLength(1);
  expect(result.observations[0]).toMatchObject({ kind: "billed_variation_without_extra", extraIds: [], sourceIds: [id(30), id(31)] });
  expect(JSON.stringify(result)).not.toContain(id(41));
  expect(JSON.stringify(mixed)).toBe(before);
});
it("adapts unmatched stored other lines even for a job with no captures; cites the fact and current run only", () => {
  const before = JSON.stringify(storedRow), result = observed();
  expect(result.observations).toEqual([expect.objectContaining({ kind: "billed_variation_without_extra", jobId: id(6), extraIds: [], sourceIds: [id(30), id(31)] })]);
  expect(Object.keys(result.observations[0]!).sort()).toEqual(["extraIds", "id", "jobId", "kind", "sourceIds"]);
  expect(observed()).toEqual(result); expect(JSON.stringify(storedRow)).toBe(before);
  expect(Object.isFrozen(result.observations)).toBe(true);
  expect(result.billing.status).toBe("supplied_stored_facts");
  expect(result.method.text).toContain("classification requires human review");
  // Two unmatched lines on an invoice cite one fact, never two fees or counts.
  expect(observed([storedRow, { ...storedRow, line: { ...storedRow.line, externalInvoiceLineId: "second" } }]).observations).toEqual(result.observations);
});
it("rejects duplicate stored line replays and conflicting job/run references", () => {
  expect(() => observed([storedRow, storedRow])).toThrow("DASHBOARD_INVALID");
  for (const change of [{ jobId: id(90) }, { runId: id(91) }])
    expect(() => observed([storedRow, { ...storedRow, ...change, line: { ...storedRow.line, externalInvoiceLineId: "second" } }])).toThrow("DASHBOARD_INVALID");
});
it("stays silent for original orders, credits, rejections, incomplete or future facts and operative selections", () => {
  for (const row of [
    { ...storedRow, line: { ...storedRow.line, kind: "original_order" } },
    { ...storedRow, creditedNet: { numerator: "100", denominator: "1" } },
    { ...storedRow, rejected: true }, { ...storedRow, complete: false },
    { ...storedRow, at: "2026-12-01T00:00:00Z" }, { ...storedRow, recordedAt: "2026-12-01T00:00:00Z" },
    { ...storedRow, at: facts.cutoff },
  ]) expect(observed([row]).observations).toEqual([]);
  for (const q of [{ ...query, filters: { team: id(99) } }, { ...query, filters: { client: id(99) } },
    { ...query, until: at }, { ...query, dimension: "operative" }, { ...query, filters: { operative: id(3) } }]) {
    const result = observed([storedRow], q);
    expect(result.observations).toEqual([]); expect(JSON.stringify(result)).not.toContain(id(30));
  }
  expect(observed([storedRow], { ...query, from: at }).observations).toHaveLength(1);
  expect(observed([{ ...storedRow, creditedNet: { numerator: "199", denominator: "2" } }]).observations).toHaveLength(1);
});
it("rejects malformed stored money and preserves activity/billing projections regardless of advisory presence", () => {
  expect(() => scopedEnterpriseSignals(facts, query, signals, null)).toThrow("DASHBOARD_INVALID");
  for (const billedNet of [{ numerator: "bad", denominator: "1" }, { numerator: "100", denominator: "0" }, { numerator: "-1", denominator: "1" }])
    expect(() => observed([{ ...storedRow, billedNet }])).toThrow();
  const without = observed([]), withSignal = observed();
  expect(without.observations).toEqual([]); expect(withSignal.observations).toHaveLength(1);
  expect(JSON.stringify(facts)).not.toContain("billed_variation_without_extra");
});
