import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); });
async function principal(tenant?: Parameters<typeof jobDoorsActor>[1]) {
  const a = await jobDoorsActor(db.owner, tenant), credential = randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${a.person}@fictional.invalid`, a.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [a.person,a.tenant,a.member]);
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(),a.person,credential]);
  return { ...a, credential };
}
type Principal = Awaited<ReturnType<typeof principal>>;
async function request(p: Principal, work: (c: PoolClient) => Promise<void>) {
  const c = await db.runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)", [p.credential,p.tenant]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)", [p.tenant]);
    await work(c);
  } finally { await c.query("ROLLBACK"); c.release(); }
}
async function refused(c: PoolClient, sql: string, args: unknown[], code = "42501") {
  await c.query("SAVEPOINT attack");
  try { await expect(c.query(sql,args)).rejects.toMatchObject({ code }); }
  finally { await c.query("ROLLBACK TO attack; RELEASE attack"); }
}
function invoiceCommand(p: Principal) {
  const id = randomUUID();
  return { version:"command.v1", commandId:id, commandType:"customer_invoice.issue", semanticKey:id,
    actorMembershipId:p.member, subjectType:"job", subjectRef:randomUUID(),
    action:{ actionType:"final_account.issue", recipient:null, contentHash:"a".repeat(64), aggregateRevision:1,
      amountPence:1200, currency:"GBP", policyVersion:"fictional.v1", expiresAt:"2099-01-01T00:00:00Z" } };
}
async function begin(c: PoolClient, p: Principal, command = invoiceCommand(p)) {
  return c.query("SELECT app.begin_command($1,$2,$3,$4,$5,$6,$7) result", [command.version,command.commandId,
    command.commandType,command.semanticKey,{ tenantId:p.tenant,actorMembershipId:p.member,subjectType:command.subjectType,subjectRef:command.subjectRef },
    { aggregateRevision:1 },command]);
}

it("refuses standalone number-burning and allocates only once inside a checked invoice command", async () => {
  const p = await principal();
  const issued = (await db.owner.query("SELECT id,invoice_number,pdf_sha256 FROM app.customer_invoice ORDER BY tenant_id,id")).rows;
  await request(p,async c => {
    for (let i=0;i<20;i++) await refused(c,"SELECT app.reserve_customer_invoice_number($1)",[p.tenant]);
    expect((await c.query("SELECT next_number FROM app.customer_invoice_sequence WHERE tenant_id=$1",[p.tenant])).rows).toEqual([]);
    await begin(c,p);
    for (let i=0;i<100;i++) expect((await c.query("SELECT app.reserve_customer_invoice_number($1) n",[p.tenant])).rows[0].n).toBe("1");
    expect((await c.query("SELECT next_number FROM app.customer_invoice_sequence WHERE tenant_id=$1",[p.tenant])).rows[0].next_number).toBe("2");
    // The LP-5 deferred proof prevents committing a reservation without issuance.
    await refused(c,"SET CONSTRAINTS ALL IMMEDIATE",[],"23514");
    await refused(c,"UPDATE app.command_lifecycle_claim SET reserved_invoice_number=NULL WHERE tenant_id=$1",[p.tenant]);
    await refused(c,"SELECT app.reserve_customer_invoice_number($1)",[randomUUID()]);
  });
  expect((await db.owner.query("SELECT next_number FROM app.customer_invoice_sequence WHERE tenant_id=$1",[p.tenant])).rows).toEqual([]);
  expect((await db.owner.query("SELECT id,invoice_number,pdf_sha256 FROM app.customer_invoice ORDER BY tenant_id,id")).rows).toEqual(issued);
});

it("refuses reservation after approval revocation, including on the same transaction", async () => {
  const p=await principal(), c=await db.owner.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT app.bind_request('real',$1,$2)",[p.credential,p.tenant]);
    await c.query("SELECT set_config('app.tenant_id',$1,true)",[p.tenant]);
    await c.query("SET LOCAL ROLE jobguard_runtime");
    await begin(c,p);
    await c.query("RESET ROLE");
    // Owner-only adversarial fixture: revoke the uncommitted exact authorization.
    await c.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1",[p.tenant]);
    await c.query("SET LOCAL ROLE jobguard_runtime");
    await refused(c,"SELECT app.reserve_customer_invoice_number($1)",[p.tenant]);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("keeps progress operational despite forged actor settings, and refuses cross-tenant progress", async () => {
  const p=await principal(), job=randomUUID(), scope=randomUUID();
  await db.owner.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional LP13 job')",[p.tenant,job]);
  await db.owner.query("INSERT INTO app.scope_identity(tenant_id,job_id,id) VALUES($1,$2,$3)",[p.tenant,job,scope]);
  await db.owner.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3)",[p.tenant,job,scope]);
  await db.owner.query(`INSERT INTO app.scope_revision(tenant_id,job_id,scope_item_id,id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
    VALUES($1,$2,$3,$4,1,'Fictional commitment','1','item',1000,1000)`,[p.tenant,job,scope,randomUUID()]);
  const before=(await db.owner.query("SELECT * FROM app.job WHERE tenant_id=$1 AND id=$2",[p.tenant,job])).rows;
  await request(p,async c => {
    await c.query("SELECT set_config('app.actor_id',$1,true)",[randomUUID()]);
    const row=(await c.query("SELECT * FROM app.transition_scope_progress($1,$2,$3,0,'in_progress','start')",[p.tenant,job,scope])).rows[0];
    expect(row).toMatchObject({stage:"in_progress",revision:1});
    await refused(c,"SELECT app.transition_scope_progress($1,$2,$3,1,'complete','actor:forged')",[p.tenant,job,scope],"22023");
    expect((await c.query("SELECT * FROM app.job WHERE tenant_id=$1 AND id=$2",[p.tenant,job])).rows).toEqual(before);
    expect((await c.query("SELECT total_pence FROM app.scope_revision WHERE tenant_id=$1 AND job_id=$2",[p.tenant,job])).rows).toEqual([{total_pence:"1000"}]);
    for (const table of ["customer_invoice","recovery_fee_journal","action_authorization","cap_snapshot"]) {
      expect((await c.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`,[p.tenant])).rows[0].n).toBe(0);
    }
  });
  const other=await principal();
  await request(other,c=>refused(c,"SELECT app.transition_scope_progress($1,$2,$3,0,'in_progress','start')",[p.tenant,job,scope]));
});

it("keeps legacy raisers explicitly unknown without manufacturing command attribution", async () => {
  const p=await principal(), job=randomUUID(), scope=randomUUID(), variation=randomUUID();
  const c=await db.owner.connect();
  try {
    await c.query("BEGIN");
    await c.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional legacy job')",[p.tenant,job]);
    await c.query(`INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance)
      VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')`,[p.tenant,job]);
    await c.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')",[p.tenant,job,scope]);
    await c.query(`INSERT INTO app.variation(tenant_id,job_id,scope_item_id,id,capture_kind,capture_text,description,job_track,origin)
      VALUES($1,$2,$3,$4,'text','Fictional legacy capture','Fictional legacy extra','small_builder','builder_logged')`,[p.tenant,job,scope,variation]);
    expect((await c.query("SELECT raising_membership_id,raising_role,command_id,provenance FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",[p.tenant,variation])).rows).toEqual([
      {raising_membership_id:null,raising_role:"legacy_unrecorded",command_id:null,provenance:"legacy_synthetic_capture"}]);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("seals SSO audit under the connection tenant rather than a stale tenant setting", async () => {
  const a=await principal(), b=await principal(), connection=randomUUID();
  await db.owner.query("INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES($1,$2,$3)",[b.tenant,connection,
    {version:"sso-metadata.v1",protocol:"saml2",provider:"in-process-test-idp",id:connection,tenantId:b.tenant}]);
  const c=await db.owner.connect();
  try {
    await c.query("BEGIN; SET LOCAL ROLE jobguard_identity");
    await c.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenant]);
    const event={id:randomUUID(),version:"audit.v1",actorRef:"identity:saml",eventType:"sso.refused",subjectType:"sso-connection",subjectRef:connection,payload:{references:{environment:"synthetic_demo"},classifications:{action:"security"}}};
    await refused(c,"SELECT identity.sso_audit_append($1,$2)",[randomUUID(),{...event,subjectRef:randomUUID()}],"P0002");
    await c.query("SELECT identity.sso_audit_append($1,$2)",[connection,event]);
    await c.query("RESET ROLE");
    expect((await c.query("SELECT tenant_id,subject_ref FROM app.audit_event WHERE id=$1",[event.id])).rows).toEqual([{tenant_id:b.tenant,subject_ref:connection}]);
    expect((await c.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND id=$2",[a.tenant,event.id])).rows[0].n).toBe(0);
  } finally { await c.query("ROLLBACK"); c.release(); }
});

it("refuses the retired 0095 adoption overload without disclosing a prior result or changing records", async () => {
  const p=await principal();
  await request(p,async c => {
    await refused(c,`SELECT app.adopt_in_flight_job($1,$2,$3,'Fictional'::varchar,'live'::varchar,$4::char(64),'Fictional'::varchar,
      1000::bigint,15::bigint,'reference_fee_policy_v1'::varchar,'synthetic_import_terms_candidate.v1'::varchar,$5,clock_timestamp())`,
    [p.tenant,randomUUID(),randomUUID(),"a".repeat(64),p.member]);
    expect((await c.query("SELECT count(*)::int n FROM app.imported_job_baseline WHERE tenant_id=$1",[p.tenant])).rows[0].n).toBe(0);
  });
});

it("checks another actor's replay key before returning any stored result and repeats no effect", async () => {
  const p=await principal(), other=await principal(p.tenant), command=invoiceCommand(p);
  const result={invoiceId:randomUUID(),invoiceNumber:"fictional-private-result"};
  // Existing pre-LP5 succeeded receipt, created only by the fixture owner. Its
  // private result must be returned only to the original actor, without execution.
  await db.owner.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
    VALUES($1,$2,$3,$4,encode(sha256(convert_to(app.final_lock_canonical(jsonb_set(($5::jsonb - ARRAY['commandId','decisionId','resolutionId','authorizationId']),'{action,expiresAt}','{}')),'UTF8')),'hex'),'succeeded',$6,$7,clock_timestamp())`,
    [p.tenant,command.commandId,command.commandType,command.semanticKey,command,result,p.member]);
  const counts=async()=>(await db.owner.query(`SELECT
    (SELECT count(*)::int FROM app.customer_invoice WHERE tenant_id=$1) invoices,
    (SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$1) receipts,
    (SELECT count(*)::int FROM app.action_authorization WHERE tenant_id=$1) approvals,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits`,[p.tenant])).rows;
  const before=await counts();
  await request(other,async c=>{
    await c.query("SAVEPOINT replay");
    await expect(begin(c,other,{...command,actorMembershipId:other.member})).rejects.toMatchObject({code:"23505",message:"COMMAND_CONFLICT"});
    await c.query("ROLLBACK TO replay; RELEASE replay");
  });
  await request(p,async c=>{
    for(let i=0;i<2;i++) expect((await begin(c,p,command)).rows[0].result).toEqual({kind:"replay",result});
    await refused(c,"SELECT app.reserve_customer_invoice_number($1)",[p.tenant]);
  });
  expect(await counts()).toEqual(before);
});
