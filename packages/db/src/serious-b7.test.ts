import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { buildEvidenceManifest, canonicalManifest, manifestDigest, renderStandalonePack, sha256 } from "@jobguard/core";
import { EvidencePackRepository } from "./evidence-pack-repository.js";
import { loadEvidencePackSources } from "./evidence-pack-sources.js";
import { verifiedTenantContextForQueuedJob, type TenantTransaction } from "./tenant-context.js";

const tenantId = randomUUID(), jobId = randomUUID(), caseId = randomUUID(), memberId = randomUUID();

describe("SERIOUS-B7 regressions", () => {
  it.each(["duplicate_supplier_payment", "prevention"])("S22 loads recorded supplier evidence for %s", async caseType => {
    const invoiceId = randomUUID(), versionId = randomUUID();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM app.recovery_case WHERE")) return { rows: [{ job_id: jobId, case_type: caseType, book: "supplier_cost", source_type: "supplier_documents", source_refs: [invoiceId] }], rowCount: 1 };
      if (sql.includes("FROM app.recovery_claim_revision")) return { rows: [{ id: randomUUID(), version: 1, record: {} }], rowCount: 1 };
      if (sql.includes("FROM app.supplier_document_version")) return { rows: [{ id: versionId, document_id: invoiceId, document_type: "invoice", version: 1, record: {}, document: {} }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const loaded = await loadEvidencePackSources({ $client: { query } } as unknown as TenantTransaction, tenantId, caseId);
    expect(loaded.sources.some(source => source.sourceId === `supplier_document_version:${versionId}`)).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes("FROM app.customer_invoice"))).toBe(false);
  });

  it("S21 refuses approval after the practice session is revoked while awaiting the case lock", async () => {
    const packId = randomUUID(), actor = `membership:${memberId}`;
    const source = { sourceId: "recovery_claim_revision:synthetic", kind: "recovery_case" as const, version: 1, jobId, label: "Synthetic claim", content: "synthetic" };
    const manifest = buildEvidenceManifest(caseId, jobId, [source], []), artifact = renderStandalonePack(manifest, [source]);
    const pack = { pack_id: packId, revision: 1, case_id: caseId, job_id: jobId, canonical_manifest: canonicalManifest(manifest), manifest_hash: manifestDigest(manifest), content_hash: sha256(artifact), sources: [source], source_omissions: [], format: "TEXT", artifact_text: artifact, created_at: new Date() };
    let revoked = false;
    const writes: string[] = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("pg_advisory_xact_lock") && values?.[1] === caseId) revoked = true;
      if (sql.includes("current_setting('app.practice_material_digest'")) return { rows: [{ digest: "a".repeat(64) }], rowCount: 1 };
      if (sql.includes("app.authenticate_practice_session")) return { rows: revoked ? [] : [{ membership_id: memberId }], rowCount: revoked ? 0 : 1 };
      if (sql.includes("AS tenant_id")) return { rows: [{ tenant_id: tenantId }], rowCount: 1 };
      if (sql.includes("AS occurred_at")) return { rows: [{ occurred_at: new Date() }], rowCount: 1 };
      if (sql.startsWith("SELECT * FROM app.evidence_pack_revision")) return { rows: [pack], rowCount: 1 };
      if (sql.includes("INSERT INTO app.evidence_pack_attachment_approval")) writes.push("approval");
      if ((sql.includes("INSERT INTO app.audit_event") || sql.includes("FROM app.append_audit("))) writes.push("audit");
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release: vi.fn() }, pool = { connect: async () => client } as unknown as Pool;
    // Only immutable source assembly is replaced; transaction, case lock, replay,
    // approval validation and approval persistence execute the repository code.
    const repo = new EvidencePackRepository(pool);
    vi.spyOn(repo as unknown as { current: () => Promise<unknown> }, "current").mockResolvedValue({ jobId, sources: [source], omissions: [], manifest, artifact, manifestHash: pack.manifest_hash, contentHash: pack.content_hash });
    await expect(repo.approveAttachment(verifiedTenantContextForQueuedJob(tenantId), caseId, packId,
      { commandId: randomUUID(), expectedManifestHash: pack.manifest_hash, expectedContentHash: pack.content_hash }, actor)).rejects.toThrow("UNAUTHENTICATED");
    expect(writes).toEqual([]);
    expect(query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
  });
});
