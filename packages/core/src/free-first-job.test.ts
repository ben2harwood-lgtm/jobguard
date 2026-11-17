import { describe, expect, it } from "vitest";
import { freeFirstJobKey, previewFreeFirstJob, previewFreeFirstJobEnd } from "./free-first-job.js";
const tenantId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const otherJob = "00000000-0000-4000-8000-000000000003";
const identity = { version: "free-first-job-identity.v1", environment: "synthetic_demo", companyNumber: "DEMO0001", normalizedPhone: null, cardFingerprint: null };
const first = () => ({ version: "free-first-job-preview.v1", environment: "synthetic_demo", tenantId, jobId, identity,
  priorLiveJobIds: [], consumedKeys: [], card: null });
const timeline = () => ({ version: "free-first-job-end-preview.v1", environment: "synthetic_demo", tenantId, jobId,
  startedAt: "2026-01-01T12:00:00.000Z", now: "2026-01-02T12:00:00.000Z", events: [] });

describe("MON-3 supplied fictional facts, no activation authority", () => {
  it("[MON3-A03] company key cannot receive another trial across accounts or after trial end", () => {
    const key = freeFirstJobKey(identity);
    expect(key).toEqual({ status: "identified", key: '["free-first-job.v1","company","DEMO0001"]' });
    const consumed = { ...first(), consumedKeys: [key.key] };
    expect(previewFreeFirstJob(consumed).trial).toBe("already_consumed");
    expect(previewFreeFirstJob({ ...consumed, tenantId: otherJob }).trial).toBe("already_consumed");
    expect(previewFreeFirstJob({ ...consumed, identity: { ...identity, normalizedPhone: "demo_other", cardFingerprint: "sim_fp_other" } }).trial).toBe("already_consumed");
    expect(previewFreeFirstJob({ ...consumed, identity: { ...identity, companyNumber: "DEMO0002" } }).trial).toBe("candidate");
  });
  it("[MON3-A04] fallback uses the complete phone and provider fingerprint tuple", () => {
    const fallback = { ...identity, companyNumber: null, normalizedPhone: "demo_phone", cardFingerprint: "sim_fp_one" };
    const key = freeFirstJobKey(fallback);
    expect(key.status).toBe("identified");
    expect(previewFreeFirstJob({ ...first(), identity: fallback, consumedKeys: [key.key] }).trial).toBe("already_consumed");
    expect(freeFirstJobKey({ ...fallback, normalizedPhone: "demo_other" }).key).not.toBe(key.key);
    expect(freeFirstJobKey({ ...fallback, cardFingerprint: "sim_fp_two" }).key).not.toBe(key.key);
    // Tuple encoding cannot collide through separator characters.
    expect(freeFirstJobKey({ ...fallback, normalizedPhone: "demo_a,b", cardFingerprint: "sim_fp_c" }).key)
      .not.toBe(freeFirstJobKey({ ...fallback, normalizedPhone: "demo_a", cardFingerprint: "sim_fp_b,c" }).key);
  });
  it("[MON3-A05] first-only skip remains offered while unknown identity stays held", () => {
    expect(previewFreeFirstJob(first())).toMatchObject({ trial: "candidate", offerCard: true, offerSkip: true, activationAuthorized: false });
    const missing = { ...identity, companyNumber: null };
    expect(freeFirstJobKey(missing)).toEqual({ status: "identity_required", key: null });
    expect(previewFreeFirstJob({ ...first(), identity: missing })).toMatchObject({ trial: "identity_required", offerSkip: true });
    expect(previewFreeFirstJob({ ...first(), priorLiveJobIds: [otherJob] })).toMatchObject({ offerSkip: false, trial: "not_first_job" });
  });
  it("[MON3-A06] second job without a card returns the exact recovery action", () => {
    expect(previewFreeFirstJob({ ...first(), priorLiveJobIds: [otherJob] })).toMatchObject({
      cardGate: "card_required", nextAction: "add_card", label: "Add a card", activationAuthorized: false,
    });
  });
  it("[MON3-A07] only a complete same-tenant simulated reference qualifies; redirect does not", () => {
    const card = { version: "free-first-job-card.v1", environment: "synthetic_demo", tenantId,
      status: "completed", provider: "simulated", reference: "sim_ref_one", fingerprint: "sim_fp_one" };
    const second = { ...first(), priorLiveJobIds: [otherJob] };
    expect(previewFreeFirstJob({ ...second, card }).cardGate).toBe("satisfied");
    for (const status of ["requested", "cancelled", "failed", "outcome_unknown", "redirect_only"]) {
      expect(previewFreeFirstJob({ ...second, card: { version: card.version, environment: card.environment, tenantId, status } }).cardGate).toBe("card_required");
    }
    expect(() => previewFreeFirstJob({ ...second, card: { ...card, tenantId: otherJob } })).toThrow("INVALID_FREE_FIRST_JOB_INPUT");
    expect(() => previewFreeFirstJob({ ...second, card: { ...card, reference: undefined } })).toThrow();
  });
  it("[MON3-A12] a distinct second job needs a card even when small or sharing a meter place", () => {
    const second = { ...first(), priorLiveJobIds: [otherJob, otherJob] };
    expect(previewFreeFirstJob(second).cardGate).toBe("card_required");
    for (const fields of [{ small: true }, { countedPlaces: 1 }, { stoppedCounting: true }]) {
      expect(() => previewFreeFirstJob({ ...second, ...fields })).toThrow();
    }
    expect(previewFreeFirstJob({ ...first(), priorLiveJobIds: [jobId] })).toMatchObject({ trial: "existing_job", offerSkip: false, activationAuthorized: false });
  });
  it("[MON3-A08] [MON3-A24] [MON3-A26] strict versions refuse authority, raw card and hidden inputs", () => {
    for (const extra of [{ taxIdentifier: "demo" }, { cardNumber: "demo" }, { approved: true }, { trial: true }, { hiddenSignals: [] }, { feePence: 1 }]) {
      expect(() => previewFreeFirstJob({ ...first(), ...extra })).toThrow("INVALID_FREE_FIRST_JOB_INPUT");
    }
    for (const environment of ["production", "pilot_no_charge"]) expect(() => previewFreeFirstJob({ ...first(), environment })).toThrow();
    expect(() => freeFirstJobKey({ ...identity, companyNumber: " demo " })).toThrow();
    expect(() => freeFirstJobKey({ ...identity, version: "v2" })).toThrow();
  });
  it("[MON3-A09] [MON3-A10] own lock or close ends a trial; meter stops and foreign links do not", () => {
    for (const kind of ["lock", "close"]) {
      const event = { tenantId, jobId, kind, occurredAt: "2026-01-02T10:00:00.000Z" };
      expect(previewFreeFirstJobEnd({ ...timeline(), events: [event] })).toMatchObject({ active: false, endReason: kind, endedAt: event.occurredAt });
      expect(previewFreeFirstJobEnd({ ...timeline(), events: [{ ...event, jobId: otherJob }] }).active).toBe(true);
      expect(() => previewFreeFirstJobEnd({ ...timeline(), events: [{ ...event, tenantId: otherJob }] })).toThrow();
    }
    for (const kind of ["finished_on_site", "quiet", "failed_close", "failed_lock"]) {
      expect(() => previewFreeFirstJobEnd({ ...timeline(), events: [{ tenantId, jobId, kind, occurredAt: timeline().now }] })).toThrow();
    }
  });
  it("[MON3-A11] reference elapsed ninety-day boundary is exact across DST and leap dates", () => {
    for (const startedAt of ["2026-01-01T12:00:00.000Z", "2026-03-01T12:00:00.000Z", "2026-10-01T12:00:00.000Z", "2028-02-01T12:00:00.000Z"]) {
      const deadline = new Date(Date.parse(startedAt) + 90 * 86400000).toISOString();
      expect(previewFreeFirstJobEnd({ ...timeline(), startedAt, now: new Date(Date.parse(deadline) - 1).toISOString() }).active).toBe(true);
      expect(previewFreeFirstJobEnd({ ...timeline(), startedAt, now: deadline })).toMatchObject({ active: false, endedAt: deadline, endReason: "day_90" });
      expect(previewFreeFirstJobEnd({ ...timeline(), startedAt, now: new Date(Date.parse(deadline) + 86400000).toISOString() }).endedAt).toBe(deadline);
    }
  });
  it("[MON3-A12] [MON3-A13] earliest event wins under permutation, future facts and same-job replay", () => {
    const second = { tenantId, jobId: otherJob, kind: "switch_live", occurredAt: "2026-01-02T09:00:00.000Z" };
    const close = { tenantId, jobId, kind: "close", occurredAt: "2026-01-02T10:00:00.000Z" };
    const future = { ...close, kind: "lock", occurredAt: "2026-01-03T10:00:00.000Z" };
    const expected = previewFreeFirstJobEnd({ ...timeline(), events: [second, close, future] });
    expect(expected).toMatchObject({ endReason: "second_job", endedAt: second.occurredAt });
    expect(previewFreeFirstJobEnd({ ...timeline(), events: [future, close, second, second] })).toEqual(expected);
    expect(previewFreeFirstJobEnd({ ...timeline(), events: [{ ...second, jobId, occurredAt: timeline().startedAt }] }).active).toBe(true);
    expect(() => previewFreeFirstJobEnd({ ...timeline(), events: [{ ...second, occurredAt: "2025-12-31T00:00:00.000Z" }] })).toThrow();
  });
  it("[MON3-A01] [MON3-A15] [MON3-A23] previews mutate no facts and produce no commercial or data-access effect", () => {
    const input = first(), before = JSON.stringify(input);
    expect(previewFreeFirstJob(input)).toMatchObject({ hypothetical: true, realExternalActions: 0, activationAuthorized: false });
    expect(JSON.stringify(input)).toBe(before);
    expect(() => previewFreeFirstJob({ ...input, phase: "quoting" })).toThrow();
    expect(Object.keys(previewFreeFirstJobEnd(timeline())).sort()).toEqual([
      "active", "deadlineAt", "endReason", "endedAt", "environment", "hypothetical", "policyVersion", "realExternalActions", "version",
    ]);
  });
});
