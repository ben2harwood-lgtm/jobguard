import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { lp4WriterSources } from "./lp4-writer-catchup-fixture.js";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditBatch, auditEventTrust, verifyAuditChain, type AuditEvent, type AuditEventInput } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
let db: JobDoorsDatabase;
let tenant: string;
const statement = (extra: Partial<AuditEventInput> = {}): AuditEventInput => ({
  id: randomUUID(), version: "audit.v1", actorRef: "membership:synthetic-claim", eventType: "payment.completed",
  subjectType: "job", subjectRef: randomUUID(), payload: { references: { jobId: randomUUID(), a: "a", A: "A", _a: "_a" } }, ...extra,
});
async function transaction<T>(pool: Pool, t: string, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [t]);
    const value = await work(client); await client.query("COMMIT"); return value;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
const append = (t: string, inputs: AuditEventInput[]) => withTenant(db.runtime, testTenantContext(t), tx => appendAuditBatch(tx, inputs));
async function chain(t: string): Promise<AuditEvent[]> {
  return transaction(db.runtime, t, async client => (await client.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,
    actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,
    occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash"
    FROM app.audit_event ORDER BY sequence`)).rows);
}
beforeAll(async () => { db = await jobDoorsDatabase(true); tenant = (await jobDoorsActor(db.owner)).tenant; }, 300_000);
afterAll(async () => { await db?.close(); });
describe("LP-4 actual runtime audit boundary (synthetic PostgreSQL)", () => {
  it("serializes competing batches and agrees with v2 canonicalization, clock and verifier", async () => {
    await Promise.all(Array.from({ length: 8 }, () => append(tenant, [statement(), statement()])));
    const events = await chain(tenant);
    expect(events.map(e => e.sequence)).toEqual(Array.from({ length: 16 }, (_, n) => n + 1));
    expect(() => verifyAuditChain(events)).not.toThrow();
    expect(events.every(e => e.version === "audit.v2" && auditEventTrust(e) === "lower_trust")).toBe(true);
    expect(events.every(e => Math.abs(e.occurredAt.getTime() - Date.now()) < 60_000)).toBe(true);
  });

  it.each(Object.keys(lp4WriterSources))("%s installs its exact sealed definition and retains its main security contract", async name => {
    const inventory = JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8"));
    const expected = inventory.recorded.routines.filter((r: { identity: string }) => r.identity.startsWith(`function:${name}(`));
    expect(expected).toHaveLength(1);
    const rows = (await db.owner.query(`SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef security,
      p.proconfig config,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') digest,
      has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
      p.prosrc source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname||'.'||p.proname=$1`, [name])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner: expected[0].owner, security: expected[0].securityDefiner,
      config: [expected[0].searchPath], digest: expected[0].definitionSha256, runtime: expected[0].runtimeExecute });
    expect(rows[0].source).toContain("app.lp4_seal_audit(");
    expect(rows[0].source).not.toMatch(/INSERT\s+INTO\s+app\.audit_event/i);
  });
  it.each(["app.append_audit", "app.lp4_seal_audit"])("%s matches its recorded database definition", async name => {
    const inventory=JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json",import.meta.url),"utf8"));
    const expected=inventory.recorded.routines.filter((r: {identity:string})=>r.identity.startsWith(`function:${name}(`));
    expect(expected).toHaveLength(1);
    const actual=(await db.owner.query(`SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') digest
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname=$1`,[name])).rows;
    expect(actual).toEqual([{digest:expected[0].definitionSha256}]);
  });
  it("refuses structured and null references even from checked operations", async () => {
    for (const exclusions of [null, [], [{ uploadId: randomUUID(), state: "rejected", reason: "verification_invalid" }], {}]) {
      const event = statement({ actorRef: "system:final_check", eventType: "final_check.sources_excluded",
        payload: { references: { manifestId: randomUUID(), lockId: randomUUID(), exclusions } } as unknown as AuditEventInput["payload"] });
      for (const trust of ["lower_trust", "checked_operation"]) {
        await expect(transaction(db.owner, tenant, client => client.query("SELECT * FROM app.lp4_seal_audit($1,$2)",
          [JSON.stringify([event]), trust]))).rejects.toMatchObject({ code: "22023", message: "AUDIT_INPUT_INVALID" });
      }
    }
  });

  it("rolls back a partial batch, its head, and business writes; retry can commit", async () => {
    const candidate = statement(), account = randomUUID(), before = (await chain(tenant)).length;
    await expect(transaction(db.owner, tenant, async client => {
      await client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional rollback')", [account, tenant]);
      await client.query("SELECT * FROM app.append_audit($1)", [JSON.stringify([candidate, candidate])]);
    })).rejects.toMatchObject({ code: "23505" });
    expect((await chain(tenant))).toHaveLength(before);
    expect((await db.owner.query("SELECT 1 FROM app.account WHERE id=$1", [account])).rowCount).toBe(0);
    await append(tenant, [candidate]);
    await expect(append(tenant, [candidate])).rejects.toMatchObject({ code: "23505" });
    await expect(append(tenant, [{ ...candidate, subjectRef: randomUUID() }])).rejects.toMatchObject({ code: "23505" });
    expect((await chain(tenant))).toHaveLength(before + 1);
    verifyAuditChain(await chain(tenant));
  });
  it("withdraws direct writes, old head routines, private sealing and role assumption", async () => {
    for (const sql of ["INSERT INTO app.audit_event DEFAULT VALUES", "UPDATE app.audit_event SET sequence=sequence", "DELETE FROM app.audit_event", "TRUNCATE app.audit_event",
      "SELECT app.lock_audit_head()", "SELECT app.advance_audit_head(1,'a')", "SELECT app.lp4_seal_audit('[]','checked_operation')", "SET ROLE jobguard_audit_writer",
      "SELECT app.append_final_lock_audit(NULL,NULL,NULL,NULL,NULL)", "SELECT app.append_shadow_audit(NULL,NULL,NULL)"]) {
      await expect(db.runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    }
    const role = (await db.owner.query("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='jobguard_audit_writer'")).rows[0];
    expect(role).toEqual({ rolcanlogin: false, rolsuper: false, rolbypassrls: false });
    expect((await db.owner.query(`SELECT has_schema_privilege('jobguard_audit_writer','app','CREATE') can_create,
      pg_has_role('jobguard_migration','jobguard_audit_writer','USAGE') can_use,
      pg_has_role('jobguard_migration','jobguard_audit_writer','SET') can_set`)).rows).toEqual([
      { can_create: false, can_use: false, can_set: false },
    ]);
  });
  it("refuses forged metadata, reserved collisions and private content without echoing it", async () => {
    const before = (await chain(tenant)).length;
    const invalid = [
      { ...statement(), sequence: 900 }, { ...statement(), occurredAt: "2000-01-01T00:00:00Z" },
      { ...statement(), tenantId: randomUUID() }, { ...statement(), eventHash: "f".repeat(64) },
      { ...statement(), payload: { references: { auditTrust: "checked_operation" } } },
      { ...statement(), payload: { references: { actorRef: "membership:other" } } },
      { ...statement(), payload: { references: { email: "fictional@example.invalid" } } },
      { ...statement(), payload: { secret: "synthetic-private-content" } },
    ];
    for (const bad of invalid) await expect(transaction(db.runtime, tenant, client => client.query("SELECT * FROM app.append_audit($1)", [JSON.stringify([bad])]))).rejects.toMatchObject({ code: "22023", message: "AUDIT_INPUT_INVALID" });
    expect((await chain(tenant))).toHaveLength(before);
  });
  it("labels authority-named statements lower_trust; authority-consumer closure remains REFUSED", async () => {
    const other = (await jobDoorsActor(db.owner)).tenant;
    const inputs = ["approval.approved", "payment.settled", "command.completed", "payment.reversed", "command.cancelled"].map(eventType => statement({ eventType,
      payload: { references: { jobId: randomUUID(), finalAccountRevision: "locked:1", amountPence: "0" } } }));
    const events = await append(tenant, inputs);
    expect(events.every(e => auditEventTrust(e) === "lower_trust")).toBe(true);
    expect(await chain(other)).toEqual([]);
    expect((await chain(tenant)).filter(e => inputs.some(i => i.id === e.id))).toHaveLength(inputs.length);
    // This only proves the trust label and absence of an authorization insert.
    // Reserved-type rejection and downstream authority-consumer closure are NOT proved or built here.
    expect((await db.owner.query("SELECT count(*)::int n FROM app.action_authorization WHERE tenant_id=$1", [tenant])).rows[0].n).toBe(0);
  });
  it("converts every current SQL writer to the private primitive, with old bridge withdrawn", async () => {
    const writers = (await db.owner.query(`SELECT n.nspname||'.'||p.proname name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('app','identity') AND p.prosrc ~* 'INSERT[[:space:]]+INTO[[:space:]]+app[.]audit_event' ORDER BY 1`)).rows;
    expect(writers).toEqual([{ name: "app.lp4_seal_audit" }]);
    expect((await db.owner.query("SELECT has_function_privilege('jobguard_identity','identity.sso_audit_head(uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
    await transaction(db.owner, tenant, async client => {
      await client.query("SELECT app.append_final_lock_audit($1,$2,$3,'final_account.locked',$4)", [randomUUID(), randomUUID(), randomUUID(), JSON.stringify({ revisionId: randomUUID() })]);
      await client.query("SELECT app.append_shadow_audit($1,$2,'shadow.disclosed')", [randomUUID(), randomUUID()]);
    });
    const events = await chain(tenant);
    expect(events.slice(-2).map(auditEventTrust)).toEqual(["checked_operation", "checked_operation"]);
    verifyAuditChain(events);
  });
});
