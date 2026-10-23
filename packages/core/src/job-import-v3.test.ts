import { describe, expect, it } from "vitest";
import { adoptJobV1 } from "./job-import.js";
import { jobPartiesImportV1, jobPartiesImportResultV1 } from "./job-parties.js";
import { adoptJobV3, jobPartiesImportV3, jobImportResultV3, importPreviewHashV3, importActionHashV3, importedJobIsSmallV3, assertImportResultV3 } from "./job-import-v3.js";
import { isSmallJobV3 } from "./small-job-v3.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const snapshot = () => ({ version: "adopt-job.v3", fixtureId: "fictional-live.v1", sourceJobId: id(1),
  parties: { bindingId: id(2), customerRevisionId: id(3), siteRevisionId: id(4), payingPartyRevisionId: id(3) },
  lifecyclePoint: "live", baseline: { sourceBaselineId: id(5), sourceHash: "a".repeat(64), description: "Attested scope", acceptedNetPence: 100100,
    lines: [{ sourceLineId: id(6), description: "Original builder scope", netPence: 100100 }] },
  terms: { version: "synthetic_demo_import.v3", policyVersion: "reference_fee_policy_v3", commercialTrack: "small_builder" },
  attestation: { version: "import-attestation.v3", wording: "I attest this fictional baseline.", attest: true }, historyManifest: [] });
const request = () => ({ version: "job-parties-import.v3", commandId: id(7), expectedBindingId: id(2), fixtureId: "fictional-live.v1", lifecyclePoint: "live", previewHash: importPreviewHashV3(snapshot()), attest: true });
const receipt = () => ({ version: "job-import-result.v3", importId: id(8), jobId: id(9), termsId: id(10), baselineId: id(11),
  lineageStrength: "builder_attested_weaker", provenance: "imported", lifecyclePoint: "live", linkedJobIds: [id(12)], meterResultRef: id(13),
  environment: "synthetic_demo", realExternalActions: 0, actionHash: importActionHashV3(snapshot()),
  baseline: { acceptedNetPence: 100100, lines: [{ sourceLineId: id(6), scopeItemId: id(14), netPence: 100100, origin: "builder_baseline" }] } });
describe("CH5-C strict synthetic import contracts", () => {
  it("[CH5-C01] keeps v1 distinct and unchanged", () => {
    const oldRequest = { version: "job-parties-import.v1", commandId: id(7), expectedBindingId: id(2) };
    expect(jobPartiesImportV1.parse(oldRequest)).toEqual(oldRequest);
    expect(jobPartiesImportV3.safeParse(oldRequest).success).toBe(false);
    expect(jobPartiesImportResultV1.safeParse(receipt()).success).toBe(false);
    expect(adoptJobV3.safeParse(snapshot()).success).toBe(true);
    expect(adoptJobV1.safeParse(snapshot()).success).toBe(false);
    expect(adoptJobV3.safeParse({ ...snapshot(), version: "adopt-job.v1" }).success).toBe(false);
  });
  it("[CH5-C02] rejects public authority, money, cap, status and policy overrides", () => {
    expect(jobPartiesImportV3.parse(request())).toEqual(request());
    for (const key of ["tenantId", "actor", "receivedAt", "adoptedAt", "smallJob", "count", "fee", "recoveryCapPence", "paid", "policyVersion", "environment"]) {
      expect(jobPartiesImportV3.safeParse({ ...request(), [key]: 1 }).success, key).toBe(false);
      expect(adoptJobV3.safeParse({ ...snapshot(), [key]: 1 }).success, key).toBe(false);
    }
    for (const change of [{ commandId: "bad" }, { previewHash: "bad" }, { lifecyclePoint: "paid" }, { attest: false }, { fixtureId: "../file" }])
      expect(jobPartiesImportV3.safeParse({ ...request(), ...change }).success).toBe(false);
    for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER, 1000000000001]) {
      const s = snapshot(); s.baseline.acceptedNetPence = value; s.baseline.lines[0]!.netPence = value;
      expect(adoptJobV3.safeParse(s).success).toBe(false);
    }
    const s = snapshot();
    expect(adoptJobV3.safeParse({ ...s, parties: { ...s.parties, tenantId: id(1) } }).success).toBe(false);
    expect(adoptJobV3.safeParse({ ...s, terms: { ...s.terms, recoveryCapPence: 1 } }).success).toBe(false);
    expect(adoptJobV3.safeParse({ ...s, terms: { ...s.terms, policyVersion: "reference_fee_policy_v1" } }).success).toBe(false);
  });
  it("[CH5-C03] hashes every approved field and canonicalizes object key order only", () => {
    const s = snapshot(), hash = importPreviewHashV3(s);
    expect(importActionHashV3(s)).toBe(hash);
    expect(importPreviewHashV3(Object.fromEntries(Object.entries(s).reverse()))).toBe(hash);
    const changes = [ { ...s, sourceJobId: id(99) }, { ...s, fixtureId: "other.v1" }, { ...s, lifecyclePoint: "invoiced" },
      { ...s, parties: { ...s.parties, bindingId: id(99) } }, { ...s, parties: { ...s.parties, customerRevisionId: id(99) } },
      { ...s, parties: { ...s.parties, siteRevisionId: id(99) } }, { ...s, parties: { ...s.parties, payingPartyRevisionId: id(99) } },
      { ...s, baseline: { ...s.baseline, acceptedNetPence: 100101, lines: [{ ...s.baseline.lines[0], netPence: 100101 }] } },
      { ...s, baseline: { ...s.baseline, lines: [{ ...s.baseline.lines[0], description: "Changed scope" }] } },
      { ...s, attestation: { ...s.attestation, wording: "Changed wording" } },
      { ...s, historyManifest: [{ sourceId: id(20), sourceLineId: id(6), evidenceId: id(21), objectVersionId: "immutable-1", sha256: "b".repeat(64), byteLength: 80, sourceOccurredAt: "2026-10-01T00:00:00.000001Z" }] } ];
    for (const changed of changes) expect(importPreviewHashV3(changed)).not.toBe(hash);
  });
  it("[CH5-C04] reconciles exact baseline and stable distinct line identities, deeply freezing parsed data", () => {
    const s = snapshot(), r = receipt();
    expect(Object.isFrozen(adoptJobV3.parse(s).baseline.lines[0])).toBe(true);
    expect(Object.isFrozen(s.baseline)).toBe(false);
    const parsed = jobImportResultV3.parse(r);
    expect(parsed.baseline.lines[0]!.scopeItemId).toBe(id(14));
    expect(assertImportResultV3(s, r)).toEqual(parsed);
    for (const changed of [{ ...r, actionHash: "b".repeat(64) }, { ...r, lifecyclePoint: "invoiced" },
      { ...r, baseline: { ...r.baseline, lines: [{ ...r.baseline.lines[0], sourceLineId: id(99) }] } }])
      expect(() => assertImportResultV3(s, changed)).toThrow("IMPORT_RESULT_SNAPSHOT_MISMATCH");
    expect(Object.isFrozen(parsed.baseline.lines)).toBe(true);
    expect(jobImportResultV3.safeParse({ ...r, baseline: { ...r.baseline, acceptedNetPence: 1 } }).success).toBe(false);
    expect(adoptJobV3.safeParse({ ...s, baseline: { ...s.baseline, acceptedNetPence: 1 } }).success).toBe(false);
    expect(adoptJobV3.safeParse({ ...s, baseline: { ...s.baseline, acceptedNetPence: 200200, lines: [...s.baseline.lines, ...s.baseline.lines] } }).success).toBe(false);
    for (const key of ["scopeItemId", "sourceLineId"]) {
      const lines = [r.baseline.lines[0]!, { ...r.baseline.lines[0]!, scopeItemId: id(30), sourceLineId: id(31), [key]: r.baseline.lines[0]![key as "scopeItemId" | "sourceLineId"] }];
      expect(jobImportResultV3.safeParse({ ...r, baseline: { acceptedNetPence: 200200, lines } }).success).toBe(false);
    }
    expect(jobImportResultV3.safeParse({ ...r, baseline: { ...r.baseline, lines: [{ ...r.baseline.lines[0], origin: "jobguard_catch" }] } }).success).toBe(false);
    for (const change of [{ feePence: 0 }, { count: 1 }, { realExternalActions: 1 }, { customerAcceptanceId: id(22) }])
      expect(jobImportResultV3.safeParse({ ...r, ...change }).success).toBe(false);
  });
  it("[CH5-C02/03] binds the complete immutable history and refuses duplicate or foreign source lines", () => {
    const entry = { sourceId: id(20), sourceLineId: id(6), evidenceId: id(21), objectVersionId: "original-1", sha256: "b".repeat(64), byteLength: 80, sourceOccurredAt: "2026-10-01T00:00:00.000001Z" };
    const s = { ...snapshot(), historyManifest: [entry] };
    const original = importActionHashV3(s);
    expect(() => assertImportResultV3(s, receipt())).toThrow("IMPORT_RESULT_SNAPSHOT_MISMATCH");
    for (const change of [{ sourceId: id(22) }, { evidenceId: id(22) }, { objectVersionId: "original-2" }, { sha256: "c".repeat(64) }, { byteLength: 81 }, { sourceOccurredAt: null }, { sourceLineId: null }])
      expect(importActionHashV3({ ...s, historyManifest: [{ ...entry, ...change }] })).not.toBe(original);
    for (const change of [{ sourceLineId: id(99) }, { evidenceId: "bad" }, { byteLength: 0 }, { receivedAt: "2026-10-02T00:00:00Z" }])
      expect(adoptJobV3.safeParse({ ...s, historyManifest: [{ ...entry, ...change }] }).success).toBe(false);
    expect(adoptJobV3.safeParse({ ...s, historyManifest: [entry, entry] }).success).toBe(false);
  });
  it("[CH5-C08] delegates small-job classification to the existing predicate", () => {
    for (const amount of [0, 199999, 200000, 1000000000000]) {
      const s = snapshot(); s.baseline.acceptedNetPence = amount; s.baseline.lines[0]!.netPence = amount;
      expect(importedJobIsSmallV3(s)).toBe(isSmallJobV3(amount, 0));
    }
  });
});
