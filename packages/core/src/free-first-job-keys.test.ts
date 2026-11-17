import { describe, expect, it } from "vitest";
import { freeFirstJobKeys, freeFirstJobKey, previewFreeFirstJob } from "./free-first-job.js";
const identity = { version: "free-first-job-identity.v1", environment: "synthetic_demo", companyNumber: "FICTIONAL", normalizedPhone: "demo_phone", cardFingerprint: "sim_fp_one" };
const preview = (value: typeof identity | { companyNumber: null; normalizedPhone: string; cardFingerprint: string; version: string; environment: string }, consumedKeys: readonly string[]) => previewFreeFirstJob({ version: "free-first-job-preview.v1", environment: "synthetic_demo", tenantId: "00000000-0000-4000-8000-000000000001", jobId: "00000000-0000-4000-8000-000000000002", identity: value, consumedKeys, priorLiveJobIds: [], card: null });
describe("MON-3-P-A all available keys", () => {
 it("MON3P-KEY-01 company-present then company-omitted refuses", () => {
  expect(preview({ ...identity, companyNumber: null }, freeFirstJobKeys(identity)).trial).toBe("already_consumed");
 });
 it("MON3P-KEY-02 phone/card-consumed then company-added refuses", () => {
  expect(preview(identity, freeFirstJobKeys({ ...identity, companyNumber: null })).trial).toBe("already_consumed");
 });
 it("MON3P-KEY-03 either changed key cannot bypass the other", () => {
  const keys = freeFirstJobKeys(identity);
  for (const consumed of [keys, [...keys].reverse()]) {
   expect(preview({ ...identity, companyNumber: "OTHER" }, consumed).trial).toBe("already_consumed");
   expect(preview({ ...identity, normalizedPhone: "other", cardFingerprint: "sim_fp_other" }, consumed).trial).toBe("already_consumed");
  }
 });
 it("preserves compact tuple bytes and compatibility without mutation", () => {
  const original = JSON.stringify(identity), keys = freeFirstJobKeys(Object.freeze(identity));
  expect(keys).toEqual(['["free-first-job.v1","company","FICTIONAL"]', '["free-first-job.v1","phone_card","demo_phone","simulated","sim_fp_one"]']);
  expect(keys[0]).toBe(freeFirstJobKey(identity).key);
  expect(keys[1]).toBe(freeFirstJobKey({ ...identity, companyNumber: null }).key);
  expect(JSON.stringify(identity)).toBe(original); expect(Object.isFrozen(keys)).toBe(true);
  expect(freeFirstJobKeys({ ...identity, companyNumber: 'a"\\,b' })[0]).toBe(JSON.stringify(["free-first-job.v1", "company", 'a"\\,b']));
 });
 it("never derives a partial fallback or uses tenant/user identifiers", () => {
  for (const partial of [{ normalizedPhone: null }, { cardFingerprint: null }, { normalizedPhone: null, cardFingerprint: null }]) {
   expect(freeFirstJobKeys({ ...identity, companyNumber: null, ...partial })).toEqual([]);
   expect(freeFirstJobKeys({ ...identity, ...partial })).toHaveLength(1);
  }
 });
});

it('SB-21: A second trial for the same company, or the same phone and card', () => {
 expect(preview(identity, []).trial).toBe("candidate");
 const consumed = freeFirstJobKeys(identity);
 expect(preview({ ...identity, normalizedPhone: "another", cardFingerprint: "sim_fp_another" }, consumed).trial).toBe("already_consumed");
 expect(preview({ ...identity, companyNumber: "ANOTHER" }, consumed).trial).toBe("already_consumed");
 expect(preview({ ...identity, companyNumber: "ANOTHER", normalizedPhone: "another", cardFingerprint: "sim_fp_another" }, consumed).trial).toBe("candidate");
});
