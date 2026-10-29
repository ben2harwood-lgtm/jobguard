import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleEvidencePackV3, renderStandalonePackV3 } from "@jobguard/core";
import { describe, expect, it } from "vitest";
import { canonicalAuditHash } from "../src/audit.js";
import { AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX, signAuditExport } from "../src/audit-export-repository.js";
import { SyntheticEvidenceSigner, verifySignedEvidenceExport } from "../src/signed-evidence-export.js";

const tenantId = randomUUID(), jobId = randomUUID(), caseId = randomUUID(), exportId = randomUUID();
const before = "2026-01-01T00:00:00.000Z", createdAt = "2026-10-29T08:00:00.000Z", expiry = "2027-01-01T00:00:00.000Z";
function fixture() {
  const event = { id: exportId, version: "audit.v1" as const, tenantId, sequence: 1,
    occurredAt: new Date(createdAt), actorRef: "fixture:owner", eventType: "audit.export.created",
    subjectType: "audit-export", subjectRef: exportId, payload: {},
    payloadHash: createHash("sha256").update("{}").digest("hex"), previousHash: null };
  const entry = { ...event, eventHash: canonicalAuditHash(event), occurredAt: createdAt };
  const audit = signAuditExport({ version: "audit-export.v1", environment: "synthetic_demo",
    notice: AUDIT_EXPORT_NOTICE, sandbox: AUDIT_EXPORT_SANDBOX, tenantId, exportId, createdAt,
    entryCount: 1, headHash: entry.eventHash, entries: [entry],
    checkpoints: [{ tenantId, sequence: 1, eventHash: entry.eventHash, recordedAt: createdAt }] });
  const pack = assembleEvidencePackV3({ tenantId, jobId, caseId, lifecycle: { state: "pre_lock" },
    records: [{ kind: "ordinary", sourceId: "scope-r1", recordedAt: "2026-10-29T07:00:00.123456Z", content: "Synthetic scope revision 1" }] });
  const signer = new SyntheticEvidenceSigner(tenantId, "synthetic-assurance");
  signer.rotate("v1", before, expiry);
  const bundle = signer.sign(pack.artifactText, audit, createdAt);
  const context = { version: "evidence-verification-context.v1", tenantId, jobId, caseId, exportId,
    checkedAt: createdAt, trustedKeys: signer.verificationKeys() };
  return { signer, bundle, context, pack, audit };
}
describe("M5-9 synthetic signed evidence manifests", () => {
  it("reports exact scope, key identity and unverifiable gaps without echoing source content or keys", () => {
    const { bundle, context } = fixture();
    const report = verifySignedEvidenceExport(bundle, context);
    expect(report).toMatchObject({ integrityValid: true, signerTrusted: true, syntheticIntegrityComplete: true,
      complete: false, keyVersion: "v1", signerId: "synthetic-assurance", timestampTrust: "unverified", revoked: false });
    expect(report.gaps.join(" ")).toContain("No external timestamp");
    expect(JSON.stringify(report)).not.toMatch(/PUBLIC KEY|Synthetic scope revision/);
  });
  it("rotates while old signatures and retained public records stay unchanged; duplicate versions fail", () => {
    const { signer, bundle, context, pack, audit } = fixture();
    const oldBytes = JSON.stringify(bundle), oldKeys = signer.verificationKeys();
    signer.rotate("v2", createdAt, expiry);
    const next = signer.sign(pack.artifactText, audit, createdAt);
    const trustedKeys = signer.verificationKeys();
    expect(trustedKeys[0]).toEqual(oldKeys[0]); expect(JSON.stringify(bundle)).toBe(oldBytes);
    for (const file of [bundle, next]) expect(verifySignedEvidenceExport(file, { ...context, trustedKeys }).signerTrusted).toBe(true);
    expect(next.payload.keyVersion).toBe("v2");
    expect(() => signer.rotate("v1", before, expiry)).toThrow("Invalid synthetic");
    trustedKeys[0]!.revoked = true;
    expect(signer.verificationKeys()[0]!.revoked).toBe(false);
  });
  it("does not trust bundled keys, a different tenant registry, replaced material, or revoked keys", () => {
    const { bundle, context } = fixture();
    for (const trustedKeys of [[], context.trustedKeys.map(k => ({ ...k, tenantId: randomUUID() })),
      context.trustedKeys.map(k => ({ ...k, revoked: true }))]) {
      expect(verifySignedEvidenceExport(bundle, { ...context, trustedKeys })).toMatchObject({ signerTrusted: false, syntheticIntegrityComplete: false });
    }
    const other = fixture();
    expect(verifySignedEvidenceExport(bundle, { ...context, trustedKeys: other.context.trustedKeys }).signerTrusted).toBe(false);
    expect(() => verifySignedEvidenceExport(bundle, { ...context, trustedKeys: [...context.trustedKeys, ...context.trustedKeys] })).toThrow();
  });
  it.each(["tenantId", "jobId", "caseId", "exportId"])("rejects replay under a different expected %s", field => {
    const { bundle, context } = fixture();
    expect(() => verifySignedEvidenceExport(bundle, { ...context, [field]: randomUUID() })).toThrow();
    expect(verifySignedEvidenceExport(bundle, context)).toEqual(verifySignedEvidenceExport(bundle, context));
  });
  it.each(["missing", "duplicate", "altered", "revision", "foreign tenant", "hidden before lock"])("rejects %s source material before signing", attack => {
    const { signer, pack, audit } = fixture();
    const sources = structuredClone(pack.sources), manifest = structuredClone(pack.manifest);
    if (attack === "missing") sources.pop();
    if (attack === "duplicate") sources.push(sources[0]!);
    if (attack === "altered") sources[0]!.content += " changed";
    if (attack === "revision") sources[0]!.sourceVersion = "r2";
    if (attack === "foreign tenant") sources[0]!.tenantId = randomUUID();
    if (attack === "hidden before lock") manifest.entries[0]!.kind = "source_observations";
    expect(() => signer.sign(renderStandalonePackV3(manifest, sources), audit, createdAt)).toThrow();
  });
  it("rejects changed signed manifest, invalid signature, audit checkpoint mismatch and cross-tenant signing", () => {
    const { signer, bundle, context, pack, audit } = fixture();
    expect(() => verifySignedEvidenceExport({ ...bundle, payload: { ...bundle.payload, jobId: randomUUID() } }, context)).toThrow();
    expect(() => verifySignedEvidenceExport({ ...bundle, signatureBase64: Buffer.alloc(64).toString("base64") }, context)).toThrow();
    const payload = JSON.parse(Buffer.from(audit.payloadBase64, "base64").toString());
    payload.checkpoints[0].eventHash = "0".repeat(64);
    expect(() => signer.sign(pack.artifactText, { ...audit, payloadBase64: Buffer.from(JSON.stringify(payload)).toString("base64") }, createdAt)).toThrow();
    const foreign = new SyntheticEvidenceSigner(randomUUID(), "synthetic-assurance"); foreign.rotate("v1", before, expiry);
    expect(() => foreign.sign(pack.artifactText, audit, createdAt)).toThrow();
  });
  it("reports historical expiry and rejects future or outside-window times", () => {
    const { signer, bundle, context, pack, audit } = fixture();
    expect(verifySignedEvidenceExport(bundle, { ...context, checkedAt: expiry })).toMatchObject({ keyExpired: true, signerTrusted: true, complete: false });
    expect(verifySignedEvidenceExport(bundle, { ...context, checkedAt: before }).signerTrusted).toBe(false);
    for (const time of ["2025-01-01T00:00:00.000Z", expiry, "bad", "2026-10-29T08:00:00Z", "2026-10-29T08:00:00.0000Z"])
      expect(() => signer.sign(pack.artifactText, audit, time)).toThrow();
  });
  it("preserves reversal bytes and locked-source revisions, reports absent sections, and rejects conflicting links", () => {
    const { signer, audit, context } = fixture();
    const pack = assembleEvidencePackV3({ tenantId, jobId, caseId,
      lifecycle: { state: "post_lock", lockedAt: "2026-10-29T07:30:00.000000Z", evidenceCutoff: "2026-10-29T07:30:00.000000Z" },
      records: [
        { kind: "lock", sourceId: "locked-bill-r1", recordedAt: "2026-10-29T07:30:00.000000Z", content: "Synthetic immutable bill r1" },
        { kind: "settlement", sourceId: "settled-r1", recordedAt: "2026-10-29T07:31:00.000000Z", content: "Synthetic settlement 100 pence" },
        { kind: "settlement", sourceId: "reversal-r2", recordedAt: "2026-10-29T07:32:00.000000Z", content: "Synthetic compensating reversal -100 pence; original remains" },
      ] });
    const bundle = signer.sign(pack.artifactText, audit, createdAt);
    expect(bundle.evidenceText).toContain("compensating reversal -100 pence");
    expect(verifySignedEvidenceExport(bundle, context).gaps.join(" ")).toContain("attribution_revision absent");
    const sources = structuredClone(pack.sources), manifest = structuredClone(pack.manifest);
    const lock = manifest.entries.find(e => e.kind === "lock")!;
    const { kind: _kind, recordedAt: _recordedAt, links: _links, ...reference } = lock;
    const wrong = { ...reference, sourceVersion: "wrong-locked-bill-revision" };
    manifest.entries.find(e => e.sourceId === "reversal-r2")!.links = [wrong];
    sources.find(e => e.sourceId === "reversal-r2")!.links = [wrong];
    expect(() => signer.sign(renderStandalonePackV3(manifest, sources), audit, createdAt)).toThrow();
  });
  it("executes the offline CLI against independent context and rejects missing input", async () => {
    const { bundle, context } = fixture(), dir = await mkdtemp(join(tmpdir(), "jg-m5-9-"));
    await writeFile(join(dir, "bundle.json"), JSON.stringify(bundle));
    await writeFile(join(dir, "context.json"), JSON.stringify(context));
    const cli = fileURLToPath(new URL("../tools/verify-signed-evidence-export.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [cli, join(dir, "bundle.json"), join(dir, "context.json")], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ complete: false, syntheticIntegrityComplete: true, keyVersion: "v1" });
    expect(spawnSync(process.execPath, [cli], { encoding: "utf8" }).status).toBe(2);
  });
});
