import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalAuditHash, type AuditEvent } from "../src/audit.js";
import { AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX, auditExportFingerprint, signAuditExport, verifySignedAuditExport, type AuditExportFile, type AuditExportPayload } from "../src/audit-export-repository.js";
const cli = fileURLToPath(new URL("../tools/verify-audit-export.mjs", import.meta.url));
const tenantId = randomUUID(), exportId = randomUUID();
const events: AuditEvent[] = [];
for (let sequence = 1; sequence <= 3; sequence++) {
  const event = { id: sequence === 3 ? exportId : randomUUID(), version: "audit.v1" as const, tenantId, sequence, occurredAt: new Date(`2026-10-11T12:00:0${sequence}.000Z`), actorRef: `membership:${randomUUID()}`, eventType: sequence === 3 ? "audit.export.created" : "fixture.created", subjectType: "audit-export", subjectRef: sequence === 3 ? exportId : randomUUID(), payload: {}, payloadHash: createHash("sha256").update("{}").digest("hex"), previousHash: events.at(-1)?.eventHash ?? null };
  events.push({ ...event, eventHash: canonicalAuditHash(event) });
}
const fixture = () => signAuditExport({ version: "audit-export.v1", environment: "synthetic_demo", notice: AUDIT_EXPORT_NOTICE, sandbox: AUDIT_EXPORT_SANDBOX, tenantId, exportId, createdAt: events[2]!.occurredAt.toISOString(), entryCount: 3, headHash: events[2]!.eventHash, checkpoints: [{ tenantId, sequence: 2, eventHash: events[1]!.eventHash, recordedAt: "2026-10-11T12:00:02.500Z" }], entries: events.map(e => ({ ...e, occurredAt: e.occurredAt.toISOString() })) });
async function run(file: unknown, trusted: string | undefined) {
  const dir = await mkdtemp(join(tmpdir(), "jg-audit-cli-"));
  try {
    await writeFile(join(dir, "export.json"), JSON.stringify(file));
    if (trusted) await writeFile(join(dir, "public.pem"), trusted);
    const result = spawnSync(process.execPath, [cli, join(dir, "export.json"), ...(trusted ? ["--trusted-public-key", join(dir, "public.pem")] : [])], { encoding: "utf8" });
    expect(result.error).toBeUndefined();
    return { status: result.status, report: JSON.parse(result.stdout) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
function alter(file: AuditExportFile, mutate: (payload: AuditExportPayload) => void) {
  const payload: AuditExportPayload = JSON.parse(Buffer.from(file.payloadBase64, "base64").toString()); mutate(payload);
  return { ...file, payloadBase64: Buffer.from(JSON.stringify(payload)).toString("base64") };
}
// Re-sign malformed structures to prove chain/scope/checkpoint checking independently of byte-signature checking.
function resign(file: AuditExportFile) {
  const keys = generateKeyPairSync("ed25519"), publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const payload = JSON.parse(Buffer.from(file.payloadBase64, "base64").toString()); payload.signerFingerprint = auditExportFingerprint(publicKeyPem);
  const bytes = Buffer.from(JSON.stringify(payload));
  return { ...file, publicKeyPem, payloadBase64: bytes.toString("base64"), signatureBase64: sign(null, bytes, keys.privateKey).toString("base64") };
}
describe("ENT-10b offline audit export verifier", () => {
  it("verifies exact bytes offline with independently supplied public material", async () => {
    const file = fixture(), { status, report } = await run(file, file.publicKeyPem);
    expect(status).toBe(0); expect(report).toMatchObject({ integrityValid: true, complete: true, signerTrusted: true, tenantId, exportId, entryCount: 3, notice: "The signature proves export integrity only" });
  });
  it("never treats the bundled public key as independent trust", async () => {
    const { status, report } = await run(fixture(), undefined); expect(status).toBe(1); expect(report).toMatchObject({ integrityValid: true, complete: false, signerTrusted: false });
  });
  it.each([
    ["altered entry", (p: AuditExportPayload) => { p.entries[0]!.actorRef = "membership:altered"; }],
    ["missing entry", (p: AuditExportPayload) => { p.entries.splice(1, 1); }],
    ["reordered entries", (p: AuditExportPayload) => { p.entries.reverse(); }],
    ["truncated tail", (p: AuditExportPayload) => { p.entries.pop(); }],
    ["foreign tenant entry", (p: AuditExportPayload) => { p.entries[0]!.tenantId = randomUUID(); }],
    ["foreign checkpoint", (p: AuditExportPayload) => { p.checkpoints[0]!.tenantId = randomUUID(); }],
    ["checkpoint mismatch", (p: AuditExportPayload) => { p.checkpoints[0]!.eventHash = "f".repeat(64); }],
    ["missing checkpoint", (p: AuditExportPayload) => { p.checkpoints = []; }],
  ])("detects %s with original signature and with a new valid signature", async (_name, mutate) => {
    const original = fixture(), altered = alter(original, mutate);
    expect((await run(altered, original.publicKeyPem)).status).toBe(1);
    const newlySigned = resign(altered); expect((await run(newlySigned, newlySigned.publicKeyPem)).status).toBe(1);
  });
  it("detects truncation even if the untrusted sender updates the entry count and head", async () => {
    const file = resign(alter(fixture(), p => { p.entries.pop(); p.entryCount--; p.headHash = p.entries.at(-1)!.eventHash; }));
    expect((await run(file, file.publicKeyPem)).status).toBe(1);
  });
  it("detects invalid signatures, replacement public keys and wrong trust material", async () => {
    const file = fixture(), other = fixture();
    for (const changed of [{ ...file, signatureBase64: Buffer.alloc(64).toString("base64") }, { ...file, publicKeyPem: other.publicKeyPem }]) expect((await run(changed, file.publicKeyPem)).status).toBe(1);
    expect((await run(file, other.publicKeyPem)).status).toBe(1);
  });
  it("uses strict versioned boundaries and typed validation failures", () => {
    expect(() => verifySignedAuditExport({ ...fixture(), privateKey: "not-allowed" })).toThrowError("AUDIT_EXPORT_INVALID");
  });
  it("reports CLI usage and unreadable input with exit 2", () => {
    expect(spawnSync(process.execPath, [cli], { encoding: "utf8" }).status).toBe(2);
    expect(spawnSync(process.execPath, [cli, "/nonexistent/export.json"], { encoding: "utf8" }).status).toBe(2);
    expect(spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" }).status).toBe(0);
  });
});
