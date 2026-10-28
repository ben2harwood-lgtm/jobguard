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
  const result = scopedEnterpriseSignals(facts, query, { ...signals, billedVariations: [{ jobId: id(6), sourceId: id(20), kind: "variation", extraId: null }] });
  expect(result.billing.status).toBe("held"); expect(result.observations.every(s => s.kind !== "billed_variation_without_extra")).toBe(true);
});

it("records the actual ENT-6 contract gap: an invoice extra with no export match is invalid", () => {
  const line = { externalInvoiceLineId: "fictional-unmatched", kind: "extra", existedAt: at, netPence: 100, vatPence: 20, grossPence: 120, match: null };
  expect(billingInvoiceLineV1.safeParse(line).success).toBe(false);
  expect(billingInvoiceLineV1.safeParse({ ...line, kind: "other" }).success).toBe(true);
});
