import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { auditActorAttribution, canonicalAuditHash, verifyAuditChain, type AuditEvent, type AuditEventInput } from "./audit.js";
import { AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX, signAuditExport, verifySignedAuditExport } from "./audit-export-repository.js";
const id = "40000000-0000-4000-8000-000000000001";
function sealed(change: Partial<Omit<AuditEventInput, "version"> & { version: AuditEvent["version"] }> = {}) {
  const event = { id, version: "audit.v3" as const, tenantId: id, sequence: 1, actorRef: `membership:${id}`,
    eventType: "audit.export.created", subjectType: "job", subjectRef: id, occurredAt: new Date("2026-10-31T11:00:00.000Z"),
    payload: { references: { auditActorKind: "bound_member", auditTrust: "lower_trust" } },
    payloadHash: "", previousHash: null, eventHash: "", ...change };
  const payload = JSON.stringify(event.payload, (_, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
  event.payloadHash = createHash("sha256").update(payload).digest("hex");
  event.eventHash = canonicalAuditHash(event);
  return event;
}
it("verifies and exports distinct bound-person/system attribution", () => {
  for (const event of [sealed(), sealed({ actorRef: "system:database:postgres", payload: { references: { auditActorKind: "system", auditTrust: "checked_operation" } } })]) {
    verifyAuditChain([event]);
    const file = signAuditExport({ version: "audit-export.v1", environment: "synthetic_demo", notice: AUDIT_EXPORT_NOTICE,
      sandbox: AUDIT_EXPORT_SANDBOX, tenantId: id, exportId: id, createdAt: event.occurredAt.toISOString(), entryCount: 1,
      headHash: event.eventHash, checkpoints: [{ tenantId: id, sequence: 1, eventHash: event.eventHash, recordedAt: event.occurredAt.toISOString() }],
      entries: [{ ...event, occurredAt: event.occurredAt.toISOString() }] });
    expect(verifySignedAuditExport(file).actorAttribution).toEqual([{ id, actorRef: event.actorRef, kind: auditActorAttribution(event) }]);
  }
});
it("never authenticates old names retroactively", () => {
  for (const version of ["audit.v1", "audit.v2"] as const) {
    const event = sealed({ version, payload: version === "audit.v1" ? {} : { references: { auditTrust: "lower_trust" } } });
    verifyAuditChain([event]); expect(auditActorAttribution(event)).toBe("legacy_claim");
  }
});
it.each(["approval.approved", "payment.settled", "command.completed", "quote.accepted", "invoice.issued"])("refuses unchecked %s even with valid hashes", eventType => {
  expect(() => verifyAuditChain([sealed({ eventType })])).toThrow("Unchecked authority event");
  verifyAuditChain([sealed({ eventType, payload: { references: { auditActorKind: "bound_member", auditTrust: "checked_operation" } } })]);
});
it.each(["actor", "tenant", "type", "actorRef", "tenantId", "eventType"])("refuses reserved payload field %s", key => {
  expect(() => verifyAuditChain([sealed({ payload: { references: { auditActorKind: "bound_member", auditTrust: "lower_trust", [key]: "forged" } } })])).toThrow("Reserved audit payload field");
});
it("refuses actor substitution, contradictory attribution and absent attribution", () => {
  expect(() => verifyAuditChain([{ ...sealed(), actorRef: "system:database:postgres" }])).toThrow();
  for (const actorRef of ["system:database:postgres", "membership:forged"]) {
    expect(() => verifyAuditChain([sealed({ actorRef })])).toThrow("Invalid audit actor attribution");
  }
  expect(() => verifyAuditChain([sealed({ payload: { references: { auditTrust: "lower_trust" } } })])).toThrow("Invalid audit actor attribution");
});

it.each(["id", "version", "subjectType", "subjectRef", "sequence", "occurredAt", "previousHash", "eventHash"])("refuses sealed metadata collision %s in every payload section", key => {
  for (const [section, value] of [["references", "forged"], ["hashes", "a".repeat(64)], ["classifications", "security"]] as const) {
    expect(() => verifyAuditChain([sealed({ payload: {
      references: { auditActorKind: "bound_member", auditTrust: "lower_trust" }, [section]: {
        ...(section === "references" ? { auditActorKind: "bound_member", auditTrust: "lower_trust" } : {}), [key]: value,
      },
    } })])).toThrow("Reserved audit payload field");
  }
});
it.each(["auditTrust", "auditActorKind"])("refuses misplaced trusted metadata %s", key => {
  expect(() => verifyAuditChain([sealed({ payload: {
    references: { auditActorKind: "bound_member", auditTrust: "lower_trust" }, hashes: { [key]: "a".repeat(64) },
  } })])).toThrow("Reserved audit payload field");
});

it("extends the latest predecessor sealer and rechecks expiry after the final lock", () => {
  const directory = new URL("../migrations/", import.meta.url);
  const definition = /CREATE (?:OR REPLACE )?FUNCTION app\.lp4_seal_audit\([\s\S]*?END \$\$;/u;
  const predecessors = readdirSync(directory).filter(name => name.endsWith(".sql") && name < "0785")
    .sort().filter(name => definition.test(readFileSync(new URL(name,directory),"utf8")));
  expect(predecessors.at(-1)).toBe("0520_lp4_database_audit.sql");
  const sql = readFileSync(new URL("0785_lp6e_audit_attribution.sql",directory),"utf8");
  expect(sql.match(/CREATE (?:OR REPLACE )?FUNCTION /gu)).toHaveLength(1);
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_audit_writer");
  const lock = sql.indexOf("SELECT h.sequence,h.event_hash INTO seq,prev");
  const recheck = sql.indexOf("IF app.current_actor() IS DISTINCT FROM bound_actor",lock);
  expect(lock).toBeGreaterThan(0); expect(recheck).toBeGreaterThan(lock);
  expect(recheck).toBeLessThan(sql.indexOf("seq:=seq+1"));
});

// Nested payload/hash names are data, not collisions with the sealed columns.
it.each(["payload", "payloadHash"])("accepts nested %s while still checking the sealed hash", key => {
  const event = sealed({ payload: { references: { auditActorKind: "bound_member", auditTrust: "lower_trust" }, hashes: { [key]: "a".repeat(64) } } });
  verifyAuditChain([event]);
  expect(() => verifyAuditChain([{ ...event, payloadHash: "b".repeat(64) }])).toThrow("Invalid audit chain");
});
it.each(["command.succeeded", "contractor.visit.completed", "customer_credit_note.synthetic_approved", "customer_invoice.synthetic_issued", "customer_payment.recorded", "customer_payment.synthetic_recorded", "customer_payment.synthetic_reversed", "evidence_pack.attachment_approved", "outbox.authorization_revoked", "proof.completed", "recovery.terms.approved", "variation.approved"])("keeps exact legacy %s lower trust with matching SQL policy", eventType => {
  const sql = readFileSync(new URL("../migrations/0785_lp6e_audit_attribution.sql", import.meta.url), "utf8");
  expect(sql).toContain(`'${eventType}'`);
  const event = sealed({ eventType });
  verifyAuditChain([event]);
  expect(event.payload.references?.auditTrust).toBe("lower_trust");
  for (const forged of [eventType.toUpperCase(), `${eventType}.forged`]) {
    expect(() => verifyAuditChain([sealed({ eventType: forged })])).toThrow("Unchecked authority event");
  }
});

it("uses exactly the same legacy exceptions in SQL and the verifier", () => {
  const sql = readFileSync(new URL("../migrations/0785_lp6e_audit_attribution.sql", import.meta.url), "utf8");
  const source = readFileSync(new URL("./audit.ts", import.meta.url), "utf8");
  const sqlNames = [...sql.match(/eventType'\) NOT IN \(([\s\S]*?)\) AND lower/u)![1]!.matchAll(/'([^']+)'/gu)].map(match => match[1]);
  const verifierNames = [...source.match(/legacyLowerTrustEventTypes = new Set\(\[([\s\S]*?)\]\)/u)![1]!.matchAll(/"([^"]+)"/gu)].map(match => match[1]);
  expect(sqlNames).toEqual(verifierNames);
});
