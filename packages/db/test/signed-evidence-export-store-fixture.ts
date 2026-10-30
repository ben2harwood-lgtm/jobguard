import { createHash, randomUUID } from "node:crypto";
import { assembleEvidencePackV3 } from "@jobguard/core";
import { canonicalAuditHash } from "../src/audit.js";
import { AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX, signAuditExport } from "../src/audit-export-repository.js";
import { SyntheticEvidenceSigner } from "../src/signed-evidence-export.js";

export function storeFixture(tenantId = randomUUID(), jobId = randomUUID(), caseId = randomUUID(), signer = new SyntheticEvidenceSigner(tenantId, "assurance")) {
  if (!signer.verificationKeys().length) signer.rotate("v1", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z");
  const exportId = randomUUID(), createdAt = "2026-10-29T08:00:00.000Z";
  const event = { id: exportId, version: "audit.v1" as const, tenantId, sequence: 1, occurredAt: new Date(createdAt),
    actorRef: "fixture:owner", eventType: "audit.export.created", subjectType: "audit-export", subjectRef: exportId,
    payload: {}, payloadHash: createHash("sha256").update("{}").digest("hex"), previousHash: null };
  const entry = { ...event, eventHash: canonicalAuditHash(event), occurredAt: createdAt };
  const audit = signAuditExport({ version: "audit-export.v1", environment: "synthetic_demo", notice: AUDIT_EXPORT_NOTICE,
    sandbox: AUDIT_EXPORT_SANDBOX, tenantId, exportId, createdAt, entryCount: 1, headHash: entry.eventHash,
    entries: [entry], checkpoints: [{ tenantId, sequence: 1, eventHash: entry.eventHash, recordedAt: createdAt }] });
  const pack = assembleEvidencePackV3({ tenantId, jobId, caseId, lifecycle: { state: "pre_lock" },
    records: [{ kind: "ordinary", sourceId: "scope-r1", recordedAt: "2026-10-29T08:00:00.000000Z", content: "Fictional builder scope revision 1" }] });
  const bundle = signer.sign(pack.artifactText, audit, createdAt);
  return { tenantId, jobId, caseId, signer, bundle, request: { version: "signed-evidence-export-store.v1" as const,
    authorizationId: randomUUID(), actorMembershipId: randomUUID(), recipient: "assurance@example.invalid", bundle } };
}
