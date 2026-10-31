import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { auditActorAttribution, verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { jobDoorsActor, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(); }, 300_000);
afterAll(async () => { await db?.close(); });
async function principal() {
  const a = await jobDoorsActor(db.owner), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@fictional.invalid`, a.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person, a.tenant, a.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), a.person, credential]);
  return { ...a, credential };
}
const input = (extra = {}) => ({ id: randomUUID(), version: "audit.v1", actorRef: `membership:${randomUUID()}`,
  eventType: "statement.recorded", subjectType: "job", subjectRef: randomUUID(), payload: {}, ...extra });
const bind = (c: PoolClient, p: Awaited<ReturnType<typeof principal>>) => c.query("SELECT app.bind_request('real',$1,$2)", [p.credential,p.tenant]);
const append = (c: PoolClient, events: unknown[]) => c.query("SELECT * FROM app.append_audit($1)", [JSON.stringify(events)]);
async function chain(tenant: string): Promise<AuditEvent[]> {
  return (await db.owner.query(`SELECT id,version,tenant_id AS "tenantId",sequence::int,actor_ref AS "actorRef",
    event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,
    occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash"
    FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [tenant])).rows;
}
it("stamps A despite a claim naming B; verifier agrees", async () => {
  const p = await principal();
  await transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input()]); });
  const events = await chain(p.tenant); verifyAuditChain(events); expect(events).toHaveLength(1);
  expect(events[0]!.actorRef).toBe(`membership:${p.member}`); expect(auditActorAttribution(events[0]!)).toBe("bound_member");
});
it("refuses unbound runtime despite caller-selected GUCs", async () => {
  const p = await principal();
  await expect(transaction(db.runtime,p.tenant,c => append(c,[input()]))).rejects.toMatchObject({ code: "42501" });
});
it.each(["actor", "tenant", "type", "actorRef", "auditActorKind"])("refuses collision %s across payload sections", async key => {
  const p = await principal();
  for (const section of ["references", "hashes", "classifications"]) {
    await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input({ payload: { [section]: { [key]: "forged" } } })]); }))
      .rejects.toMatchObject({ code: "22023", message: "AUDIT_INPUT_INVALID" });
  }
  expect(await chain(p.tenant)).toEqual([]);
});
it.each(["approval.approved", "payment.settled", "command.completed", "quote.accepted", "invoice.issued"])("refuses generic %s and direct checked sealing", async eventType => {
  const p = await principal();
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[input({ eventType })]); }))
    .rejects.toMatchObject({ code: "42501", message: "AUDIT_CHECKED_OPERATION_REQUIRED" });
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await c.query("SELECT * FROM app.lp4_seal_audit($1,'checked_operation')",[JSON.stringify([input({eventType})])]); }))
    .rejects.toMatchObject({ code: "42501" });
  expect(await chain(p.tenant)).toEqual([]);
});
it("rollback after append restores rows/head; retry commits", async () => {
  const p = await principal(), event = input();
  const head = () => db.owner.query("SELECT sequence,event_hash FROM audit_control.audit_head WHERE tenant_id=$1",[p.tenant]);
  const before = (await head()).rows;
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[event]); throw new Error("rollback"); })).rejects.toThrow("rollback");
  expect(await chain(p.tenant)).toEqual([]); expect((await head()).rows).toEqual(before);
  await transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[event]); });
  verifyAuditChain(await chain(p.tenant));
});
it("owner-side checked writers record system work rather than a supplied person", async () => {
  const p = await principal();
  await transaction(db.owner,p.tenant,async c => {
    await c.query("SELECT * FROM app.lp4_seal_audit($1,'checked_operation')",[JSON.stringify([input({actorRef:`membership:${p.member}`,eventType:"payment.settled"})])]);
    await c.query("SELECT app.append_final_lock_audit($1,$2,$3,'final_account.locked',$4)",[randomUUID(),p.member,randomUUID(),JSON.stringify({revisionId:randomUUID()})]);
  });
  const events = await chain(p.tenant); expect(events).toHaveLength(2); verifyAuditChain(events);
  for (const event of events) { expect(auditActorAttribution(event)).toBe("system"); expect(event.actorRef).toBe("system:database:postgres"); }
});
it("rejects a GUC tenant substituted after binding", async () => {
  const p = await principal(), other = await jobDoorsActor(db.owner);
  await expect(transaction(db.runtime,p.tenant,async c => {
    await bind(c,p); await c.query("SELECT set_config('app.tenant_id',$1,true)",[other.tenant]); await append(c,[input()]);
  })).rejects.toMatchObject({code:"42501",message:"AUDIT_CONTEXT_REQUIRED"});
  expect(await chain(p.tenant)).toEqual([]); expect(await chain(other.tenant)).toEqual([]);
});
it("duplicate IDs roll back the whole batch and head", async () => {
  const p = await principal(), event = input();
  await expect(transaction(db.runtime,p.tenant,async c => { await bind(c,p); await append(c,[event,event]); })).rejects.toMatchObject({code:"23505"});
  expect(await chain(p.tenant)).toEqual([]);
  expect((await db.owner.query("SELECT 1 FROM audit_control.audit_head WHERE tenant_id=$1",[p.tenant])).rowCount).toBe(0);
});
