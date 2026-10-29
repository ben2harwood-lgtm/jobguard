import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { appendAuditBatch, auditEventTrust, canonicalAuditHash, verifyAuditChain, type AuditEvent, type AuditEventInput } from "./audit.js";
import type { TenantTransaction } from "./tenant-context.js";
import { signAuditExport, verifySignedAuditExport, AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX } from "./audit-export-repository.js";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const input: AuditEventInput = {
  id: "40000000-0000-4000-8000-000000000001", version: "audit.v1", actorRef: "user:synthetic",
  eventType: "audit.export.created", subjectType: "audit-export", subjectRef: "40000000-0000-4000-8000-000000000001", payload: {},
};
const tenantId = "30000000-0000-4000-8000-000000000003";
function event(version: AuditEvent["version"], previous?: AuditEvent): AuditEvent {
  const payload = version === "audit.v1" ? {} : { references: { auditTrust: "lower_trust" } };
  const base = { ...input, version, payload, tenantId, sequence: previous ? previous.sequence + 1 : 1,
    occurredAt: new Date("2026-10-29T12:00:00.123Z"), previousHash: previous?.eventHash ?? null,
    payloadHash: hash(version === "audit.v1" ? "{}" : '{"references":{"auditTrust":"lower_trust"}}') };
  return { ...base, eventHash: canonicalAuditHash(base) };
}
describe("LP-4 database audit protocol and historical verification", () => {
  it("sends only unsealed inputs in one SQL call, returns database facts", async () => {
    const sealed = event("audit.v2"), query = vi.fn().mockResolvedValue({ rows: [sealed] });
    expect(await appendAuditBatch({ $client: { query } } as unknown as TenantTransaction, [input])).toEqual([sealed]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toContain("FROM app.append_audit($1::jsonb)");
    expect(query.mock.calls[0]![1]).toEqual([JSON.stringify([input])]);
    expect(await appendAuditBatch({ $client: { query } } as unknown as TenantTransaction, [])).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each(["sequence", "previousHash", "eventHash", "occurredAt", "tenantId", "trust"])("refuses caller field %s", async key => {
    const query = vi.fn();
    await expect(appendAuditBatch({ $client: { query } } as unknown as TenantTransaction, [{ ...input, [key]: "forged" }])).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("verifies mixed history without authenticating legacy or generic claims", () => {
    const old = event("audit.v1"), current = event("audit.v2", old);
    expect(() => verifyAuditChain([old, current])).not.toThrow();
    expect(auditEventTrust(old)).toBe("legacy");
    expect(auditEventTrust(current)).toBe("lower_trust");
    for (const field of ["id", "actorRef", "subjectRef", "tenantId", "eventType"] as const) {
      expect(() => verifyAuditChain([old, { ...current, [field]: "forged" }])).toThrow();
    }
    expect(() => verifyAuditChain([old, { ...current, payload: { references: { auditTrust: "checked_operation" } } }])).toThrow();
  });
  it("requires a v2 trust label even with internally consistent hashes", () => {
    const bad = { ...event("audit.v2"), payload: {}, payloadHash: hash("{}") };
    bad.eventHash = canonicalAuditHash(bad);
    expect(() => verifyAuditChain([bad])).toThrow(/trust label/u);
  });
  it("reports export trust separately from integrity", () => {
    const current = event("audit.v2");
    const file = signAuditExport({ version: "audit-export.v1", environment: "synthetic_demo",
      notice: AUDIT_EXPORT_NOTICE, sandbox: AUDIT_EXPORT_SANDBOX, tenantId, exportId: current.id,
      createdAt: current.occurredAt.toISOString(), entryCount: 1, headHash: current.eventHash,
      checkpoints: [{ tenantId, sequence: 1, eventHash: current.eventHash, recordedAt: current.occurredAt.toISOString() }],
      entries: [{ ...current, occurredAt: current.occurredAt.toISOString() }] });
    expect(verifySignedAuditExport(file).evidenceTrust).toEqual([{ id: current.id, trust: "lower_trust" }]);
  });
});
