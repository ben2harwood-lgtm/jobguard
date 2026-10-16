import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PracticeInvoiceRepository, CustomerBillingCommandService, withTenant } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const T = randomUUID(), A = randomUUID(), U = randomUUID(), M = randomUUID(), H = "a".repeat(64);
const context = testTenantContext(T), credential = randomUUID();
let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, repo: PracticeInvoiceRepository;
beforeAll(async () => {
 const directory = await mkdtemp(join(tmpdir(), "invoice-later-pg-")), port = await freePort(60200, 150);
 pg = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false,
  createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await pg.initialise(); await pg.start();
 admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential });
 await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
 await admin.query(`INSERT INTO control_plane.tenant(id) VALUES($1)`, [T]);
 await admin.query(`INSERT INTO identity.identity_user(id) VALUES($1)`, [U]);
 await admin.query(`INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic later invoice')`, [A,T]);
 await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')`, [M,T,A,U]);
 await admin.query(`CREATE ROLE invoice_later_login LOGIN PASSWORD '${credential}' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO invoice_later_login`);
 runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "invoice_later_login", password: credential, max: 4 });
 repo = new PracticeInvoiceRepository(runtime);
}, 60000);
afterAll(async () => { await closeTestPools(runtime, admin); await pg?.stop(); });
async function fresh(net = 20003, tax = 4001) {
 const jobId = randomUUID(), quote = randomUUID(), draft = randomUUID(), revision = randomUUID();
 await admin.query(`INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic later invoice','live')`, [jobId,T]);
 await admin.query(`INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')`, [quote,T,jobId,H,net]);
 await admin.query(`INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)`, [draft,T,jobId]);
 await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
  VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`, [revision,T,jobId,draft,H,quote,net,tax,net+tax]);
 await admin.query(`UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2`, [T,draft,revision]);
 const command = { jobId, finalAccountRevisionId: revision, actorMembershipId: M, commandId: randomUUID(),
  recipient: "practice@example.invalid", issuedOn: "2026-10-16" };
 return { jobId, command, invoice: await repo.issue(context,command) };
}
async function creditCommand(f: Awaited<ReturnType<typeof fresh>>, netPence = 10001) {
 const input = { jobId: f.jobId, invoiceId: f.invoice.id, netPence, reason: "Synthetic correction" };
 return { ...input, actorMembershipId: M, commandId: randomUUID(), previewHash: (await repo.previewCredit(context,input)).previewHash };
}
const callCredit = (input: Awaited<ReturnType<typeof creditCommand>>) => withTenant(runtime,context,async db =>
 (await db.$client.query(`SELECT * FROM app.issue_practice_customer_credit_note($1,$2,$3,$4,$5,$6,$7,$8)`,
 [T,input.jobId,input.invoiceId,input.actorMembershipId,input.commandId,input.netPence,input.reason,input.previewHash])).rows[0]);
async function auditCount(jobId: string) {
 return (await admin.query(`SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='customer_invoice.synthetic_issued'`,[T,jobId])).rows[0].n;
}

describe("LATER-B16 persisted invoice facts", () => {
 it("L075 L078 list and details persist partial payment, credit, reversal and overpayment", async () => {
  const f = await fresh(10000,2000);
  const same = async (expected: object) => {
   const listed = (await repo.list(context,f.jobId))[0]!;
   expect(listed).toMatchObject(expected);
   expect((await repo.creditView(context,f.jobId,f.invoice.id)).invoice).toEqual(listed);
   expect((await repo.receiptView(context,f.jobId,f.invoice.id)).invoice).toEqual(listed);
   expect(await new CustomerBillingCommandService(runtime).balance(context,f.invoice.id)).toMatchObject({ balance: { pence: listed.balancePence }, unappliedCredit: { pence: listed.customerCreditPence } });
  };
  const payment = await repo.recordReceipt(context,{ jobId:f.jobId,invoiceId:f.invoice.id,actorMembershipId:M,
   commandId:randomUUID(),paidOn:"2024-02-29",amountPence:3000,method:"bank_transfer",reference:"Synthetic partial receipt" });
  await same({balancePence:9000,paidPence:3000,creditedPence:0});
  await repo.issueCredit(context,await creditCommand(f,1000));
  await same({balancePence:7800,paidPence:3000,creditedPence:1200});
  await repo.reverseReceipt(context,{jobId:f.jobId,invoiceId:f.invoice.id,paymentId:payment.paymentId,
   actorMembershipId:M,commandId:randomUUID(),reason:"Synthetic receipt correction"});
  await same({balancePence:10800,paidPence:0,creditedPence:1200});
  await repo.recordReceipt(context,{jobId:f.jobId,invoiceId:f.invoice.id,actorMembershipId:M,commandId:randomUUID(),
   paidOn:"2026-10-16",amountPence:12000,method:"bank_transfer",reference:"Synthetic excess receipt"});
  await same({balancePence:0,paidPence:12000,customerCreditPence:1200});
  const persisted = await new PracticeInvoiceRepository(runtime).receiptView(context,f.jobId,f.invoice.id);
  expect(persisted.receipts).toHaveLength(2);
  expect(persisted.receipts[0]).toMatchObject({paidOn:"2024-02-29",reversal:{reason:"Synthetic receipt correction"}});
  expect(persisted.eligibleRecoveryPrincipalPence).toBe(0);
 });
 it("L079 exact issue replay creates no second audit event", async () => {
  const f = await fresh();
  expect(await auditCount(f.jobId)).toBe(1);
  await Promise.all([repo.issue(context,f.command),repo.issue(context,f.command)]);
  expect(await auditCount(f.jobId)).toBe(1);
  expect(await repo.list(context,f.jobId)).toHaveLength(1);
 });
 it("L080 SQL calendar dates do not shift with session timezone", async () => {
  const f = await fresh();
  for (const zone of ["Pacific/Auckland","America/Los_Angeles"]) {
   const client = await runtime.connect();
   try {
    await client.query(`SELECT set_config('TimeZone',$1,false)`,[zone]);
    const repository = new PracticeInvoiceRepository({connect:async()=>({query:client.query.bind(client),release:()=>undefined})} as unknown as Pool);
    expect((await repository.list(context,f.jobId))[0]!.issuedOn).toBe("2026-10-16");
   } finally { await client.query(`RESET TimeZone`); client.release(); }
  }
 });
 it("L076 changed service credit target or reason under one command conflicts", async () => {
  const f = await fresh(10000,2000), other = await fresh(10000,2000);
  const service = new CustomerBillingCommandService(runtime);
  const input = { version:"customer-credit-note.issue.v1",invoiceId:f.invoice.id,amountPence:1200,reason:"Synthetic correction",
   command:{version:"command.v1",commandId:randomUUID(),commandType:"customer_credit_note.issue",semanticKey:`credit:${randomUUID()}`,
    actorMembershipId:M,subjectType:"job",subjectRef:f.jobId,action:{actionType:"customer_credit_note.issue",recipient:null,contentHash:H,
     aggregateRevision:0,amountPence:1200,currency:"GBP",policyVersion:"candidate_m1_standard_v1",expiresAt:new Date(Date.now()+300000)}} };
  const first = await service.credit(context,input);
  expect(await service.credit(context,input)).toEqual(first);
  await expect(service.credit(context,{...input,reason:"Changed synthetic reason"})).rejects.toThrow("COMMAND_CONFLICT");
  await expect(service.credit(context,{...input,invoiceId:other.invoice.id})).rejects.toThrow("COMMAND_CONFLICT");
  expect((await repo.creditView(context,f.jobId,f.invoice.id)).credits).toHaveLength(1);
  expect((await repo.creditView(context,other.jobId,other.invoice.id)).credits).toHaveLength(0);
 });
 for (const identity of ["command", "semantic"]) {
  it(`r1 L076 concurrent changed invoice conflicts after waiting on ${identity} uniqueness`, async () => {
   const f = await fresh(10000,2000), other = await fresh(10000,2000);
   let atCommit!: () => void, releaseCommit!: () => void;
   const reachedCommit = new Promise<void>(resolve => { atCommit = resolve; });
   const canCommit = new Promise<void>(resolve => { releaseCommit = resolve; });
   let held = false;
   // Pause a real transaction just before COMMIT; every SQL statement still goes
   // to PostgreSQL under the runtime role. No provider/SQL result is substituted.
   const heldPool = { connect: async () => {
    const client = await runtime.connect();
    return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
     if (sql === "COMMIT" && !held) { held = true; atCommit(); await canCommit; }
     return client.query(sql,values);
    } };
   } } as unknown as Pool;
   const input = { version:"customer-credit-note.issue.v1",invoiceId:f.invoice.id,amountPence:1200,reason:"Synthetic correction",
    command:{version:"command.v1",commandId:randomUUID(),commandType:"customer_credit_note.issue",semanticKey:`credit:${randomUUID()}`,
     actorMembershipId:M,subjectType:"job",subjectRef:f.jobId,action:{actionType:"customer_credit_note.issue",recipient:null,contentHash:H,
      aggregateRevision:0,amountPence:1200,currency:"GBP",policyVersion:"candidate_m1_standard_v1",expiresAt:new Date(Date.now()+300000)}} };
   const first = new CustomerBillingCommandService(heldPool).credit(context,input);
   const firstObserved = first.then(value=>({value}),error=>({error}));
   let second: Promise<unknown> | undefined;
   try {
    await Promise.race([reachedCommit,first.then(()=>{throw new Error("credit completed before commit barrier");})]);
    second = new CustomerBillingCommandService(runtime).credit(context,{...input,invoiceId:other.invoice.id,
     command:{...input.command,commandId:identity==="command"?input.command.commandId:randomUUID()}});
    const observed = second.then(value=>({value}),error=>({error}));
    let waiting = false;
    for (let attempt=0;attempt<100&&!waiting;attempt++) {
     waiting = (await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='invoice_later_login' AND wait_event='transactionid') waiting`)).rows[0].waiting;
     if (!waiting) await new Promise(resolve=>setTimeout(resolve,10));
    }
    expect(waiting).toBe(true);
    releaseCommit();
    expect(await firstObserved).toHaveProperty("value.creditNoteId");
    expect(await observed).toMatchObject({error:{code:"COMMAND_CONFLICT"}});
    expect((await admin.query(`SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_type='customer_credit_note.issue' AND semantic_key=$2`,[T,input.command.semanticKey])).rows[0].n).toBe(1);
    expect((await repo.creditView(context,f.jobId,f.invoice.id)).credits).toHaveLength(1);
    expect((await repo.creditView(context,other.jobId,other.invoice.id)).credits).toHaveLength(0);
   } finally { releaseCommit(); await firstObserved; await second?.catch(()=>undefined); }
  });
 }
 it("L082 concurrent identical direct credit commands return one credit and replay", async () => {
  const f = await fresh(), input = await creditCommand(f);
  const holder = await runtime.connect();
  let pending: ReturnType<typeof callCredit> | undefined;
  try {
   await holder.query("BEGIN"); await holder.query(`SELECT set_config('app.tenant_id',$1,true)`,[T]);
   const first = (await holder.query(`SELECT * FROM app.issue_practice_customer_credit_note($1,$2,$3,$4,$5,$6,$7,$8)`,
    [T,input.jobId,input.invoiceId,M,input.commandId,input.netPence,input.reason,input.previewHash])).rows[0];
   pending = callCredit(input); const observed = pending.then(value=>({value}),error=>({error}));
   let waiting = false;
   for (let attempt=0;attempt<100&&!waiting;attempt++) {
    waiting = (await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='invoice_later_login' AND wait_event='advisory') waiting`)).rows[0].waiting;
    if (!waiting) await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(waiting).toBe(true); await holder.query("COMMIT");
   expect(await observed).toEqual({value:first});
  } finally { await holder.query("ROLLBACK"); holder.release(); await pending?.catch(()=>undefined); }
  await expect(callCredit({...input,reason:"Changed reason"})).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  const other = await fresh();
  await expect(callCredit({...input,jobId:other.jobId,invoiceId:other.invoice.id})).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  const remaining = await creditCommand(f,10002);
  await repo.issueCredit(context,remaining);
  const view = await repo.creditView(context,f.jobId,f.invoice.id);
  expect(view.credits.reduce((n,c)=>n-c.netPence,0)).toBe(20003);
  expect(view.credits.reduce((n,c)=>n-c.taxPence,0)).toBe(4001);
  expect(view.invoice.balancePence).toBe(0);
  expect((await callCredit(input)).total_pence).toBe("-12001");
 });
 it("L082 concurrent repository replay appends one credit audit event", async () => {
  const f = await fresh(), input = await creditCommand(f);
  const [first,replay] = await Promise.all([repo.issueCredit(context,input),repo.issueCredit(context,input)]);
  expect(first).toEqual(replay);
  const events = await admin.query(`SELECT id FROM app.audit_event WHERE tenant_id=$1 AND event_type='customer_credit_note.synthetic_approved' AND payload->'references'->>'creditNoteId'=$2`,[T,first.creditNoteId]);
  expect(events.rowCount).toBe(1);
 });
 it("L082 owner expiry while waiting for the invoice lock refuses the credit", async () => {
  const f = await fresh(), input = await creditCommand(f), actor = randomUUID();
  await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')`,[actor,T,A,U]);
  const holder = await admin.connect();
  let pending: ReturnType<typeof callCredit> | undefined;
  try {
   await holder.query("BEGIN");
   await holder.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':'||$2::uuid::text,0))`,[T,f.invoice.id]);
   pending = callCredit({...input,actorMembershipId:actor});
   const observed = pending.then(value=>({value}),error=>({error:error as Error}));
   let waiting = false;
   for(let attempt=0;attempt<100&&!waiting;attempt++) {
    waiting = (await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='invoice_later_login' AND wait_event='advisory') waiting`)).rows[0].waiting;
    if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(waiting).toBe(true);
   await admin.query(`UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 hour' WHERE tenant_id=$1 AND id=$2`,[T,actor]);
   await holder.query("COMMIT");
   expect(await observed).toMatchObject({error:{message:"FORBIDDEN"}});
   expect((await repo.creditView(context,f.jobId,f.invoice.id)).credits).toHaveLength(0);
  } finally {await holder.query("ROLLBACK");holder.release();await pending?.catch(()=>undefined);}
 });
 it("L082 credit authority is rechecked before replay and invoice lookup", async () => {
  const f = await fresh(), input = await creditCommand(f);
  await callCredit(input);
  for (const target of [input,{...input,jobId:randomUUID(),invoiceId:randomUUID()}]) {
   await expect(callCredit({...target,actorMembershipId:randomUUID()})).rejects.toThrow("FORBIDDEN");
  }
  const expired = randomUUID();
  await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,expires_at) VALUES($1,$2,$3,$4,'owner',clock_timestamp()-interval '1 hour')`,[expired,T,A,U]);
  await expect(callCredit({...input,actorMembershipId:expired})).rejects.toThrow("FORBIDDEN");
  const foreign = await fresh();
  await expect(withTenant(runtime,testTenantContext(randomUUID()),db=>db.$client.query(`SELECT * FROM app.issue_practice_customer_credit_note($1,$2,$3,$4,$5,$6,$7,$8)`,
   [T,foreign.jobId,foreign.invoice.id,M,randomUUID(),1,"Synthetic correction",H]))).rejects.toThrow("tenant context mismatch");
 });
});
