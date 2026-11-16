import { fakeOutboxAuditProbe } from "./audit-protocol-test-fixture.js";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { appendAuditBatch, auditActorAttribution, canonicalAuditHash, verifyAuditChain, type AuditEvent, type AuditEventInput } from "./audit.js";
import { AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX, signAuditExport, verifySignedAuditExport } from "./audit-export-repository.js";
const id = "40000000-0000-4000-8000-000000000001";
function sealed(change: Partial<Omit<AuditEventInput, "version"> & { version: AuditEvent["version"] }> = {}) {
  const event = { id, version: "audit.v3" as const, tenantId: id, sequence: 1, actorRef: `membership:${id}`,
    eventType: "audit.export.created", subjectType: "job", subjectRef: id, occurredAt: new Date("2026-10-31T11:00:00.000Z"),
    payload: { references: { auditActorKind: "bound_member", auditActorRef: `membership:${id}`, auditTrust: "lower_trust" } },
    payloadHash: "", previousHash: null, eventHash: "", ...change };
  const payload = JSON.stringify(event.payload, (_, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
  event.payloadHash = createHash("sha256").update(payload).digest("hex");
  event.eventHash = canonicalAuditHash(event);
  return event;
}
it("verifies and exports distinct bound-person/system attribution", () => {
  for (const event of [sealed(), sealed({actorRef:"operations:synthetic-generator"}), sealed({ actorRef: "system:database:postgres", payload: { references: { auditActorKind: "system", auditActorRef: "system:database:postgres", auditTrust: "checked_operation" } } })]) {
    verifyAuditChain([event]);
    const file = signAuditExport({ version: "audit-export.v1", environment: "synthetic_demo", notice: AUDIT_EXPORT_NOTICE,
      sandbox: AUDIT_EXPORT_SANDBOX, tenantId: id, exportId: id, createdAt: event.occurredAt.toISOString(), entryCount: 1,
      headHash: event.eventHash, checkpoints: [{ tenantId: id, sequence: 1, eventHash: event.eventHash, recordedAt: event.occurredAt.toISOString() }],
      entries: [{ ...event, occurredAt: event.occurredAt.toISOString() }] });
    expect(verifySignedAuditExport(file).actorAttribution).toEqual([{ id, actorRef: event.payload.references?.auditActorRef, kind: auditActorAttribution(event) }]);
  }
});
it("never authenticates old names retroactively", () => {
  for (const version of ["audit.v1", "audit.v2"] as const) {
    const event = sealed({ version, payload: version === "audit.v1" ? {} : { references: { auditTrust: "lower_trust" } } });
    verifyAuditChain([event]); expect(auditActorAttribution(event)).toBe("legacy_claim");
  }
});
it("verifies a mixed v1/v2/v3 chain against a historical checkpoint", () => {
  const old = sealed({ version: "audit.v1", payload: {} });
  const v2 = { ...sealed({ version: "audit.v2", payload: { references: { auditTrust: "lower_trust" } } }), sequence: 2, previousHash: old.eventHash };
  v2.eventHash = canonicalAuditHash(v2);
  const v3 = { ...sealed(), sequence: 3, previousHash: v2.eventHash };
  v3.eventHash = canonicalAuditHash(v3);
  const checkpoint = { tenantId: id, sequence: 2, eventHash: v2.eventHash, recordedAt: old.occurredAt };
  verifyAuditChain([old, v2, v3], checkpoint);
  expect([old, v2, v3].map(auditActorAttribution)).toEqual(["legacy_claim", "legacy_claim", "bound_member"]);
  for (const changed of ["id", "actorRef", "subjectType", "subjectRef", "eventType", "tenantId", "payloadHash"] as const) {
    expect(() => verifyAuditChain([old, v2, { ...v3, [changed]: "forged" }], checkpoint)).toThrow();
  }
});
it.each(["approval.approved", "payment.settled", "command.completed", "quote.accepted", "invoice.issued"])("refuses unchecked %s even with valid hashes", eventType => {
  expect(() => verifyAuditChain([sealed({ eventType })])).toThrow("Unchecked authority event");
  verifyAuditChain([sealed({ eventType, payload: { references: { auditActorKind: "bound_member", auditActorRef: `membership:${id}`, auditTrust: "checked_operation" } } })]);
});
it.each(["actor", "tenant", "type", "actorRef", "tenantId", "eventType"])("refuses reserved payload field %s", key => {
  expect(() => verifyAuditChain([sealed({ payload: { references: { auditActorKind: "bound_member", auditActorRef: `membership:${id}`, auditTrust: "lower_trust", [key]: "forged" } } })])).toThrow("Reserved audit payload field");
});
it("refuses actor substitution, contradictory attribution and absent attribution", () => {
  expect(() => verifyAuditChain([{ ...sealed(), actorRef: "system:database:postgres" }])).toThrow();
  for (const actorRef of ["system:database:postgres", "membership:forged"]) {
    expect(() => verifyAuditChain([sealed({ payload: { references: { auditTrust: "lower_trust", auditActorKind: "bound_member", auditActorRef: actorRef } } })])).toThrow("Invalid audit actor attribution");
  }
  expect(() => verifyAuditChain([sealed({ payload: { references: { auditTrust: "lower_trust" } } })])).toThrow("Invalid audit actor attribution");
});

it.each(["id", "version", "subjectType", "subjectRef", "sequence", "occurredAt", "previousHash", "eventHash"])("refuses sealed metadata collision %s in every payload section", key => {
  for (const [section, value] of [["references", "forged"], ["hashes", "a".repeat(64)], ["classifications", "security"]] as const) {
    expect(() => verifyAuditChain([sealed({ payload: {
      references: { auditActorKind: "bound_member", auditActorRef: `membership:${id}`, auditTrust: "lower_trust" }, [section]: {
        ...(section === "references" ? { auditActorKind: "bound_member", auditActorRef: `membership:${id}`, auditTrust: "lower_trust" } : {}), [key]: value,
      },
    } })])).toThrow("Reserved audit payload field");
  }
});
it.each(["auditTrust", "auditActorKind"])("refuses misplaced trusted metadata %s", key => {
  expect(() => verifyAuditChain([sealed({ payload: {
    references: { auditActorKind: "bound_member", auditActorRef: `membership:${id}`, auditTrust: "lower_trust" }, hashes: { [key]: "a".repeat(64) },
  } })])).toThrow("Reserved audit payload field");
});

it("extends the latest predecessor sealer and rechecks expiry after the final lock", () => {
  const directory = new URL("../migrations/", import.meta.url);
  const definition = /CREATE (?:OR REPLACE )?FUNCTION app\.lp4_seal_audit\([\s\S]*?END \$\$;/u;
  const predecessors = readdirSync(directory).filter(name => name.endsWith(".sql") && name < "0755")
    .sort().filter(name => definition.test(readFileSync(new URL(name,directory),"utf8")));
  expect(predecessors.at(-1)).toBe("0520_lp4_database_audit.sql");
  const sql = readFileSync(new URL("0758_lp6e_audit_attribution.sql",directory),"utf8");
  expect(sql.match(/CREATE (?:OR REPLACE )?FUNCTION /gu)).toHaveLength(7);
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_audit_writer");
  const lock = sql.indexOf("SELECT h.sequence,h.event_hash INTO seq,prev");
  const recheck = sql.indexOf("IF app.current_actor() IS DISTINCT FROM bound_actor",lock);
  expect(lock).toBeGreaterThan(0); expect(recheck).toBeGreaterThan(lock);
  expect(recheck).toBeLessThan(sql.indexOf("seq:=seq+1"));
});

// Nested payload/hash names are data, not collisions with the sealed columns.
it.each(["payload", "payloadHash"])("accepts nested %s while still checking the sealed hash", key => {
  const event = sealed({ payload: { references: { auditActorKind: "bound_member", auditActorRef: `membership:${id}`, auditTrust: "lower_trust" }, hashes: { [key]: "a".repeat(64) } } });
  verifyAuditChain([event]);
  expect(() => verifyAuditChain([{ ...event, payloadHash: "b".repeat(64) }])).toThrow("Invalid audit chain");
});
it.each(["command.succeeded", "contractor.extra.client_link_issued", "contractor.extra.step_approved", "contractor.prompt.command", "contractor.visit.completed", "customer_credit_note.synthetic_approved", "customer_invoice.synthetic_issued", "customer_payment.recorded", "customer_payment.synthetic_recorded", "customer_payment.synthetic_reversed", "evidence_pack.attachment_approved", "outbox.authorization_revoked", "outbox.succeeded", "proof.completed", "quote.acceptance.attested", "quote.acceptance_cancelled", "recovery.eligibility.approve", "recovery.follow_up.reminder_approved", "recovery.message.approved", "recovery.message.succeeded", "recovery.payment_payer.mark_withdrawn", "recovery.payment_payer.marked", "recovery.terms.approved", "sso.oidc.request.issued", "sso.oidc.signin.completed", "sso.request.issued", "sso.signin.completed", "synthetic_obligation.simulated_settlement", "variation.approved", "worm.authorized"])("keeps exact legacy %s lower trust with matching SQL policy", eventType => {
  const sql = readFileSync(new URL("../migrations/0758_lp6e_audit_attribution.sql", import.meta.url), "utf8");
  expect(sql).toContain(`'${eventType}'`);
  const event = sealed({ eventType });
  verifyAuditChain([event]);
  expect(event.payload.references?.auditTrust).toBe("lower_trust");
  for (const forged of [eventType.toUpperCase(), `${eventType}.forged`]) {
    expect(() => verifyAuditChain([sealed({ eventType: forged })])).toThrow("Unchecked authority event");
  }
});

it("uses exactly the same legacy exceptions in SQL and the verifier", () => {
  const sql = readFileSync(new URL("../migrations/0758_lp6e_audit_attribution.sql", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/audit.ts", import.meta.url), "utf8"); // also resolves from the built dist copy
  const sqlNames = [...sql.match(/eventType'\) NOT IN \(([\s\S]*?)\) AND lower/u)![1]!.matchAll(/'([^']+)'/gu)].map(match => match[1]);
  const verifierNames = [...source.match(/legacyLowerTrustEventTypes = new Set\(\[([\s\S]*?)\]\)/u)![1]!.matchAll(/"([^"]+)"/gu)].map(match => match[1]);
  expect(sqlNames).toEqual(verifierNames);
});

it("accepts v3 command completion without weakening the predecessor's authority checks", () => {
  const directory = new URL("../migrations/", import.meta.url);
  const definition = /FUNCTION app\.lp5_check_command_completion\(\) RETURNS trigger([\s\S]*?END \$\$;)/u;
  const predecessors = readdirSync(directory).filter(name => name.endsWith(".sql") && name < "0755")
    .sort().filter(name => definition.test(readFileSync(new URL(name, directory), "utf8")));
  const previous = readFileSync(new URL(predecessors.at(-1)!, directory), "utf8").match(definition)![1]!;
  const current = readFileSync(new URL("0758_lp6e_audit_attribution.sql", directory), "utf8").match(definition)![1]!;
  expect(previous).toContain("e.version='audit.v2'");
  expect(current).toBe(previous.replace("e.version='audit.v2'", "e.version IN ('audit.v2','audit.v3')"));
});

it.each([true, false])("answers only the exact outbox capability probe (installed=%s)", installed => {
  expect(fakeOutboxAuditProbe("SELECT to_regprocedure('app.lp6e_append_outbox_audit(jsonb)') installed", installed))
    .toEqual({ rows: [{ installed: installed ? "app.lp6e_append_outbox_audit(jsonb)" : null }] });
  for (const sql of ["SELECT to_regprocedure('app.unknown(jsonb)') installed", "SELECT unexpected", "SELECT * FROM app.lp6e_append_outbox_audit($1::jsonb)"]) {
    expect(fakeOutboxAuditProbe(sql, installed)).toBeUndefined();
  }
});

it("binds the proof to these migration bytes and the issued main predecessor", () => {
  const migration = readFileSync(new URL("../migrations/0758_lp6e_audit_attribution.sql", import.meta.url));
  const proof = JSON.parse(readFileSync(new URL("../test/migration-proofs/0758_lp6e_audit_attribution.proof.json", import.meta.url), "utf8"));
  expect(proof.migration).toBe("0758_lp6e_audit_attribution.sql");
  const gaps = proof.lp0.find((change: { section: string }) => change.section === "groups").after.gaps;
  expect(gaps).toContain("Migration SHA-256: " + createHash("sha256").update(migration).digest("hex"));
  expect(gaps.some((gap: string) => gap.startsWith("Main predecessor 8e5e90c3f994e722779e3bc23950da7358a3436f includes LP-6d 0749."))).toBe(true);
});

it("records exact PostgreSQL definitions for the sealer and version-only completion change", () => {
  const sql = readFileSync(new URL("../migrations/0758_lp6e_audit_attribution.sql", import.meta.url), "utf8");
  const proof = JSON.parse(readFileSync(new URL("../test/migration-proofs/0758_lp6e_audit_attribution.proof.json", import.meta.url), "utf8"));
  for (const [name, args, identityArgs, returns] of [
    ["lp4_seal_audit", "p_events jsonb, p_trust text", "jsonb,text", "SETOF app.audit_event"],
    ["lp5_check_command_completion", "", "", "trigger"],
  ]) {
    const body = new RegExp(`FUNCTION app\\.${name}\\([^$]*?AS \\$\\$(.*?)\\$\\$;`, "su").exec(sql)![1]!;
    const definition = `CREATE OR REPLACE FUNCTION app.${name}(${args})\n RETURNS ${returns}\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'pg_temp'\nAS $function$${body}$function$\n`;
    const record = proof.lp0.find((c: {section: string; after: {identity?: string}}) => c.section === "routines" && c.after.identity === `function:app.${name}(${identityArgs})`);
    expect(record.after.definitionSha256).toBe(createHash("sha256").update(definition).digest("hex"));
  }
});


it.each(["validate_job_proof_receipt", "retire_replaced_job_proof_findings", "retired_job_proof_findings"])("preserves every authority and replay check in %s while accepting v3", name => {
  const before = readFileSync(new URL("../migrations/0734_job_proof_statement.sql", import.meta.url), "utf8");
  const after = readFileSync(new URL("../migrations/0758_lp6e_audit_attribution.sql", import.meta.url), "utf8");
  const pattern = new RegExp(`FUNCTION app\\.${name}\\([\\s\\S]*?END \\$\\$;`, "u");
  expect(after.match(pattern)?.[0]).toBe(before.match(pattern)![0].replaceAll("e.version='audit.v2'", "e.version IN ('audit.v2','audit.v3')"));
});
it("exports bound attribution separately from the retained domain writer reference", () => {
  const event = sealed({actorRef:"operations:synthetic-generator",eventType:"commercial_track.assigned"});
  verifyAuditChain([event]);
  expect(auditActorAttribution(event)).toBe("bound_member");
  expect(event.payload.references?.auditActorRef).toBe(`membership:${id}`);
  expect(() => verifyAuditChain([sealed({payload:{references:{auditActorKind:"bound_member",auditTrust:"lower_trust",auditActorRef:"operations:synthetic-generator"}}})])).toThrow("Invalid audit actor attribution");
});
it("requires prerequisite presence without recreating it or allowing runtime access to the resolver", () => {
  const sql = readFileSync(new URL("../migrations/0758_lp6e_audit_attribution.sql", import.meta.url), "utf8");
  expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION app\.lp6e_request_binding_present/u);
  expect(sql).toContain("IF app.lp6e_request_binding_present() THEN\n  RETURN QUERY SELECT app.current_actor(),app.current_tenant();");
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6e_audit_context() FROM PUBLIC,jobguard_runtime");
  expect(sql).toContain("'auditActorRef',actor_ref");
});

it("keeps the contractor assignment system actor while returning separately bound attribution", async () => {
  const stored = sealed({actorRef:"operations:synthetic-generator",eventType:"commercial_track.assigned"});
  const query = vi.fn(async () => ({rows:[stored]}));
  const result = await appendAuditBatch({$client:{query}} as unknown as Parameters<typeof appendAuditBatch>[0], [{
    id,version:"audit.v1",actorRef:"operations:synthetic-generator",eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:id,payload:{},
  }]);
  expect(JSON.parse(String((query.mock.calls[0] as unknown as [string, unknown[]])[1][0]))[0].actorRef).toBe("operations:synthetic-generator");
  verifyAuditChain(result);
  expect(result[0]!.payload.references).toMatchObject({auditActorRef:`membership:${id}`});
});
