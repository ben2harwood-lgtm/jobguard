import { describe, expect, it } from "vitest";
import {
  MeterFoundationError, londonMeterDate, meterDay31Candidate, classifyMeterSiteSource,
  groupSuppliedMeterPlaces, computeSmallPlaceAllowance, classifyMeterActivation,
  exceedsSmallJobTripThreshold, qualifyingApprovalMeterDate,
  preserveMeterHistory, applyProspectiveMeterIdentityCorrection,
} from "./jobs-on-the-go.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const job = (n: number, customer = 1, site = 1, small = true, tenant = 1) => ({
  tenantId: uuid(tenant), jobId: uuid(n), customerId: uuid(customer), siteId: uuid(site), small,
});
const gbp = (pence: number) => ({ currency: "GBP", pence });
const snapshot = {
  snapshotId: uuid(90), date: "2026-10-01", stoppedAt: "2026-10-01T11:00:00.000001Z",
  principal: gbp(4900), places: [{ tenantId: uuid(1), customerId: uuid(1), siteId: uuid(1), jobIds: [uuid(10)], small: false }],
};

describe("MON-1 independent synthetic foundations; full acceptance held", () => {
  it.each([
    ["2026-02-27T12:00:00.000001Z", "2026-03-29", "2026-03-29T00:00:00.000000Z"],
    ["2026-09-25T12:00:00.000001Z", "2026-10-25", "2026-10-24T23:00:00.000000Z"],
    ["1840-01-01T12:00:00.000001Z", "1840-01-31", "1840-01-31T00:01:15.000000Z"],
  ])("MON1-A02 partial: day-31 midnight retains the exact London offset from %s", (activatedAt, date, at) => {
    expect(meterDay31Candidate(activatedAt)).toEqual({ version: "meter-day31-candidate.v1", activatedAt, date, at });
    expect(londonMeterDate(at)).toBe(date);
  });
  it("MON1-A02/A33 partial: year zero cannot become a different London charge-counting year", () => {
    expect(() => londonMeterDate("0000-06-01T12:00:00.000001Z")).toThrow(MeterFoundationError);
    expect(() => meterDay31Candidate("0000-06-01T12:00:00.000001Z")).toThrow(MeterFoundationError);
  });
  it.each([
    ["2026-01-02T14:00:00.000001Z", "2026-02-01T00:00:00.000000Z"],
    ["2024-02-01T23:59:00.000001Z", "2024-03-02T00:00:00.000000Z"],
    ["2026-12-15T10:00:00.000001Z", "2027-01-14T00:00:00.000000Z"],
    ["2026-03-01T10:00:00.000001Z", "2026-03-30T23:00:00.000000Z"],
    ["2026-09-26T10:00:00.000001Z", "2026-10-26T00:00:00.000000Z"],
    ["2026-06-01T23:30:00.000001Z", "2026-07-01T23:00:00.000000Z"],
    ["2026-03-29T00:30:00.000001Z", "2026-04-27T23:00:00.000000Z"],
    ["2026-10-25T00:30:00.000001Z", "2026-11-24T00:00:00.000000Z"],
  ])("MON1-A02 partial: starts at London midnight on day 31 from %s", (activation, expected) => {
    expect(meterDay31Candidate(activation)).toEqual({ version: "meter-day31-candidate.v1", activatedAt: activation, date: expected.startsWith("2026-03-30") ? "2026-03-31" : expected.startsWith("2026-07-01") ? "2026-07-02" : expected.startsWith("2026-04-27") ? "2026-04-28" : expected.slice(0, 10), at: expected });
  });
  it.each([
    ["2026-03-29T00:59:59.999999Z", "2026-03-29"],
    ["2026-03-29T23:00:00.000000Z", "2026-03-30"],
    ["2026-10-25T00:30:00.000001Z", "2026-10-25"],
    ["2026-10-25T01:30:00.000001Z", "2026-10-25"],
    ["2026-12-31T23:59:59.999999Z", "2026-12-31"],
  ])("MON1-A02 partial: London date for %s", (at, date) => expect(londonMeterDate(at)).toBe(date));

  it("MON1-A03 partial: first evidence classification includes verified proof, progress, ready delivery, goods and on-site diary", () => {
    for (const purpose of ["proof", "progress"] as const) {
      expect(classifyMeterSiteSource({ version: "job-site-source.v1", kind: "photo", original: true, verified: true, invalidated: false, purpose, objectVersionId: "v1", sha256: "a".repeat(64), byteLength: 10 })).toEqual({ firstEvidence: true, activity: true });
    }
    for (const source of [
      { kind: "delivery_note", ready: true, sourceVersionId: uuid(1) },
      { kind: "goods_receipt" }, { kind: "on_site_diary" },
    ]) expect(classifyMeterSiteSource({ version: "job-site-source.v1", ...source }).firstEvidence).toBe(true);
  });
  it("MON1-A03 partial: excluded sources never start; activity alone is not first evidence", () => {
    for (const kind of ["order", "supplier_invoice", "quote", "message", "readiness", "billing", "final_review", "jobguard_catch", "builder_extra", "stage_completion"]) {
      expect(classifyMeterSiteSource({ version: "job-site-source.v1", kind }).firstEvidence).toBe(false);
    }
    const photo = { version: "job-site-source.v1", kind: "photo", original: true, verified: true, invalidated: false, purpose: "progress", objectVersionId: "v1", sha256: "a".repeat(64), byteLength: 10 };
    for (const changes of [{ verified: false }, { original: false }, { invalidated: true }, { purpose: "snagging" }]) expect(classifyMeterSiteSource({ ...photo, ...changes }).firstEvidence).toBe(false);
    expect(classifyMeterSiteSource({ version: "job-site-source.v1", kind: "delivery_note", ready: false, sourceVersionId: uuid(1) }).firstEvidence).toBe(false);
  });
  it("MON1-A04 partial: later cancellation preserves supplied past stops and charges without selecting a restart", () => {
    const raw = { version: "meter-history-preservation.v1", history: [snapshot], laterCancellation: { markerId: uuid(91), factAt: "2026-10-02T09:00:00.000001Z" } };
    const before = JSON.stringify(raw);
    const result = preserveMeterHistory(raw);
    expect(result.history).toEqual([snapshot]);
    expect(JSON.stringify(raw)).toBe(before);
    expect(result).not.toHaveProperty("restartAt");
    expect(Object.isFrozen(result.history[0]?.principal)).toBe(true);
  });
  it("MON1-A07 partial: customer and site identities govern fixed grouping and charge once within a place", () => {
    const jobs = [job(10), job(11), job(12, 2), job(13, 1, 2), job(14, 1, 1, true, 2)];
    const result = groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date: "2026-10-01", jobs });
    expect(result.places).toHaveLength(4);
    expect(result.places.find(p => p.jobIds.length === 2)?.jobIds).toEqual([uuid(10), uuid(11)]);
    expect(groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date: "2026-10-01", jobs: [...jobs].reverse() })).toEqual(result);
  });
  it("MON1-A07 partial: equivalent UUID spelling cannot create another place or duplicate job", () => {
    const customerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const a = { ...job(10), customerId }, b = { ...job(11), customerId: customerId.toUpperCase() };
    expect(groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date: "2026-10-01", jobs: [a, b] }).places).toHaveLength(1);
    const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(() => groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date: "2026-10-01", jobs: [{ ...a, jobId }, { ...a, jobId: jobId.toUpperCase() }] })).toThrow(MeterFoundationError);
  });
  it("MON1-A07 partial: identity corrections affect future supplied computations only, with no historical debit or credit", () => {
    const raw = { version: "meter-prospective-identity.v1", history: [snapshot], future: { version: "meter-fixed-places.v1", date: "2026-10-02", jobs: [job(10), job(11, 2)] } };
    const result = applyProspectiveMeterIdentityCorrection(raw);
    expect(result.history).toEqual([snapshot]);
    expect(result.future.places).toHaveLength(2);
    expect(result.retrospectiveCorrection).toEqual(gbp(0));
    expect(() => applyProspectiveMeterIdentityCorrection({ ...raw, future: { ...raw.future, date: snapshot.date } })).toThrow(MeterFoundationError);
  });
  it.each([["Solo", 4, 4, 0], ["Builder", 7, 7, 0], ["Solo", 6, 4, 2], ["Builder", 9, 7, 2]] as const)("MON1-A08 partial: %s small allowance and overflow", (plan, smallPlaces, freeSmallPlaces, countedPlaces) => {
    expect(computeSmallPlaceAllowance({ version: "meter-small-allowance.v1", plan, rawPlaces: smallPlaces, smallPlaces })).toEqual({ version: "meter-small-allowance-result.v1", rawPlaces: smallPlaces, freeSmallPlaces, countedPlaces });
  });
  it("MON1-A08 partial: mixed group is non-small, without choosing allowance beneficiaries", () => {
    const result = groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date: "2026-10-01", jobs: [job(10), job(11, 1, 1, false)] });
    expect(result.places[0]?.small).toBe(false);
    expect(computeSmallPlaceAllowance({ version: "meter-small-allowance.v1", plan: "Solo", rawPlaces: 1, smallPlaces: 0 }).countedPlaces).toBe(1);
  });
  it("MON1-A09 partial: activation uses frozen accepted and highest-sent nets at the strict boundary", () => {
    expect(classifyMeterActivation({ version: "meter-activation-classification.v1", acceptedNet: gbp(199999), highestSentNet: gbp(199999) })).toBe(true);
    for (const [accepted, sent] of [[200000, 0], [10000, 200000]]) expect(classifyMeterActivation({ version: "meter-activation-classification.v1", acceptedNet: gbp(accepted!), highestSentNet: gbp(sent!) })).toBe(false);
  });
  it("MON1-A10 partial: strict numeric crossing is not a trip event", () => {
    expect(exceedsSmallJobTripThreshold(gbp(400000))).toBe(false);
    expect(exceedsSmallJobTripThreshold(gbp(400001))).toBe(true);
    expect(exceedsSmallJobTripThreshold(gbp(-100))).toBe(false);
  });
  it("MON1-A11 partial: supplied qualifying approval uses original London date despite later processing; proposed prices excluded", () => {
    const fact = { version: "meter-supplied-approval.v1", sourceId: uuid(1), status: "qualifying_approved", approvedAt: "2026-06-01T23:30:00.000001Z", processedAt: "2026-07-01T10:00:00.000001Z", net: gbp(400001) };
    expect(qualifyingApprovalMeterDate(fact)).toEqual({ sourceId: uuid(1), originalApprovedAt: fact.approvedAt, date: "2026-06-02", net: gbp(400001) });
    expect(qualifyingApprovalMeterDate({ version: fact.version, sourceId: fact.sourceId, status: "proposed", processedAt: fact.processedAt, net: fact.net })).toBeNull();
  });
  it("MON1-A27 partial: own foundation source has only domain imports and no environment, network or wall clock", async () => {
    const fileModule = "node:fs";
    const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string };
    const source = readFileSync(new URL("./jobs-on-the-go.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/gu)].map(m => m[1]);
    expect(imports.every(path => path === "zod" || path?.startsWith("./"))).toBe(true);
    expect(source).not.toMatch(/process\.|import\s*\(|fetch\s*\(|Date\.now|new Date\(\s*\)|\b(?:pg|postgres|https?|SDK)\b/u);
  });
  it("MON1-A33 partial: malformed foundation inputs fail with typed errors", () => {
    for (const at of ["2026-02-30T00:00:00.000001Z", "2026-10-01", "bad"]) expect(() => londonMeterDate(at)).toThrow(MeterFoundationError);
    expect(() => classifyMeterSiteSource({ version: "job-site-source.v2", kind: "goods_receipt" })).toThrow(MeterFoundationError);
    expect(() => groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date: "2026-02-30", jobs: [job(10)] })).toThrow(MeterFoundationError);
    expect(() => groupSuppliedMeterPlaces({ version: "meter-fixed-places.v1", date: "2026-10-01", jobs: [job(10), job(10, 2)] })).toThrow(MeterFoundationError);
    expect(() => computeSmallPlaceAllowance({ version: "meter-small-allowance.v1", plan: "Solo", rawPlaces: 1, smallPlaces: 2 })).toThrow(MeterFoundationError);
    expect(() => exceedsSmallJobTripThreshold(gbp(Number.MAX_SAFE_INTEGER))).toThrow(MeterFoundationError);
    expect(() => preserveMeterHistory({ version: "meter-history-preservation.v1", history: [snapshot], laterCancellation: { markerId: uuid(1), factAt: "2026-09-30T12:00:00.000001Z" } })).toThrow(MeterFoundationError);
  });
});
