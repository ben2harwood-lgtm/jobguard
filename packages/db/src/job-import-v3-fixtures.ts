import { createHash } from "node:crypto";
import { adoptJobV3, jobPartiesImportV3, type AdoptJobV3 } from "@jobguard/core";

/** Server-owned fictional input only; never a real-file ingestion or evidence adapter. */
export const IMPORT_V3_FIXTURE_ID = "fictional-extension-v3";
export const IMPORT_V3_ATTESTATION = "I attest that this fictional baseline describes work already agreed. Its lineage is builder-attested, not customer acceptance.";
export function importFixtureV3(sourceJobId: string, parties: AdoptJobV3["parties"], lifecyclePoint: "live" | "invoiced", fixtureId: string): AdoptJobV3 {
  if (fixtureId !== IMPORT_V3_FIXTURE_ID) throw new Error("IMPORT_FIXTURE_NOT_FOUND");
  return adoptJobV3.parse({
    version: "adopt-job.v3", fixtureId, sourceJobId, parties, lifecyclePoint,
    baseline: { sourceBaselineId: "c5500000-0000-4000-8000-000000000001", sourceHash: createHash("sha256").update("fictional-extension-v3:baseline:1").digest("hex"),
      description: "Fictional agreed extension baseline", acceptedNetPence: 300000,
      lines: [{ sourceLineId: "c5500000-0000-4000-8000-000000000002", description: "Fictional agreed extension works", netPence: 300000 }] },
    terms: { version: "synthetic_demo_import.v3", policyVersion: "reference_fee_policy_v3", commercialTrack: "small_builder" },
    attestation: { version: "import-attestation.v3", wording: IMPORT_V3_ATTESTATION, attest: true }, historyManifest: [],
  });
}
/** Complete normalized public intent AND path/scope. Separate from the approved content hash. */
export function importPublicRequestHashV3(tenantId: string, digest: string, sourceJobId: string, raw: unknown): string {
  const input = jobPartiesImportV3.parse(raw);
  return createHash("sha256").update(JSON.stringify({ tenantId: tenantId.toLowerCase(), digest, sourceJobId: sourceJobId.toLowerCase(), input })).digest("hex");
}
export function importTargetJobIdV3(tenantId: string, digest: string, commandId: string): string {
  const h = createHash("sha256").update(JSON.stringify(["job-import-target.v3", tenantId.toLowerCase(), digest, commandId.toLowerCase()])).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
