import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PracticeInvoiceRepository, withTenant } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const T = randomUUID(), A = randomUUID(), U = randomUUID(), M = randomUUID(), H = "a".repeat(64);
const context = testTenantContext(T);
let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, writer: Pool, dir: string;
let repo: PracticeInvoiceRepository;
type Fixture = { jobId: string; invoiceId: string; draftId: string; revisionId: string; quoteId: string; command: ReturnType<typeof issue> };
const issue = (jobId: string, finalAccountRevisionId: string) => ({ jobId, finalAccountRevisionId,
  actorMembershipId: M, commandId: randomUUID(), recipient: "practice-customer@example.invalid", issuedOn: "2026-10-14" });
async function freshInvoice(net = 20003, tax = 4001): Promise<Fixture> {
  const jobId = randomUUID(), quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();
  await admin.query(`INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Synthetic invoice audit','live')`, [jobId,T]);
  await admin.query(`INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')`, [quoteId,T,jobId,H,net]);
  await admin.query(`INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)`, [draftId,T,jobId]);
  await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`, [revisionId,T,jobId,draftId,H,quoteId,net,tax,net+tax]);
  await admin.query(`UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2`, [T,draftId,revisionId]);
  // SV5PRE set-up only: new final effects need an accepted-terms lock and a checked completion, so establish them first.
  const scopeItemId = randomUUID();
  await admin.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')`, [scopeItemId,T,jobId]);
  await admin.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',$7,1)`, [randomUUID(),T,jobId,revisionId,quoteId,scopeItemId,net]);
  await prepareInvoicePrerequisites(admin, runtime, T, jobId, M, revisionId);
  const command = issue(jobId,revisionId);
  const invoice = await repo.issue(context,command);
  return { jobId,invoiceId:invoice.id,draftId,revisionId,quoteId,command };
}
async function nextRevision(f: Fixture, net: number, tax: number) {
  const id = randomUUID();
  await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,2,$5,$6,$7,'GBP','candidate_m1_standard_v1',$8,$9,$10,false,'[]')`, [id,T,f.jobId,f.draftId,f.revisionId,"b".repeat(64),f.quoteId,net,tax,net+tax]);
  // Set-up (per C135): a revised account carries its own baseline line, so the issue routine reaches its lock-revision check.
  const scope = randomUUID();
  await admin.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')`, [scope,T,f.jobId]);
  await admin.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional revised baseline',$7,1)`, [randomUUID(),T,f.jobId,id,f.quoteId,scope,net]);
  await admin.query(`UPDATE app.final_account_draft SET revision=2,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2`, [T,f.draftId,id]);
  return id;
}
async function credit(f: Fixture, netPence: number, repository = repo) {
  const input = {jobId:f.jobId,invoiceId:f.invoiceId,netPence,reason:"Synthetic audit correction"};
  const preview = await repository.previewCredit(context,input);
  const command = {...input,actorMembershipId:M,commandId:randomUUID(),previewHash:preview.previewHash};
  return { command, result:await repository.issueCredit(context,command) };
}
async function effects(jobId: string) {
  return (await admin.query(`SELECT
    (SELECT count(*) FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2) invoices,
    (SELECT count(*) FROM app.customer_credit_note WHERE tenant_id=$1 AND job_id=$2) credits,
    (SELECT count(*) FROM app.action_authorization WHERE tenant_id=$1) authorizations,
    (SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1) commands,
    (SELECT count(*) FROM app.action_outbox WHERE tenant_id=$1) outbox,
    (SELECT count(*) FROM app.audit_event WHERE tenant_id=$1) audit`,[T,jobId])).rows[0];
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(),"invoice-audit-pg-"));
  const port = await freePort(59600,300);
  pg = new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,
    createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
  await pg.initialise(); await pg.start();
  admin = new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query(`INSERT INTO control_plane.tenant(id) VALUES($1)`,[T]);
  await admin.query(`INSERT INTO identity.identity_user(id) VALUES($1)`,[U]);
  await admin.query(`INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic invoice audit')`,[A,T]);
  await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')`,[M,T,A,U]);
  await admin.query(`CREATE ROLE invoice_audit_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO invoice_audit_login`);
  const options = {host:"127.0.0.1",port,database:"postgres",user:"invoice_audit_login",password:"synthetic",max:4};
  runtime = new Pool(options); writer = new Pool({...options,max:1}); repo = new PracticeInvoiceRepository(runtime);
},60000);
afterAll(async () => { await closeTestPools(runtime,writer,admin); await pg?.stop(); if(dir) await rm(dir,{recursive:true,force:true}); });

describe("practice invoice audit regressions (real PostgreSQL)", () => {
  it("credit history and balance share one snapshot", async () => {
    const f = await freshInvoice(110000,22000);
    let readerPid: number | undefined, writerPid: number | undefined, committed = false;
    const writerPool = {connect:async () => {
      const client = await writer.connect();
      writerPid = (await client.query(`SELECT pg_backend_pid() pid`)).rows[0].pid;
      return client;
    }} as unknown as Pool;
    const readerPool = {connect:async () => {
      const client = await runtime.connect();
      readerPid = (await client.query(`SELECT pg_backend_pid() pid`)).rows[0].pid;
      return {release:()=>client.release(), query:async (sql:string, values?:unknown[]) => {
        const result = await client.query(sql,values);
        if(sql.startsWith("SELECT i.*") && !committed) {
          // The invoice SELECT has completed on connection A. Commit on B before
          // returning its rows, so any subsequent history SELECT sees the credit.
          await credit(f,10000,new PracticeInvoiceRepository(writerPool)); committed = true;
        }
        return result;
      }};
    }} as unknown as Pool;
    const view = await new PracticeInvoiceRepository(readerPool).creditView(context,f.jobId,f.invoiceId);
    expect(committed).toBe(true); expect(readerPid).not.toBe(writerPid);
    const credited = view.credits.reduce((n,c)=>n-c.totalPence,0);
    expect(view.invoice.creditedPence).toBe(credited);
    expect(view.invoice.balancePence).toBe(view.invoice.totalPence-credited);
    const after = await repo.creditView(context,f.jobId,f.invoiceId);
    expect(after.credits).toHaveLength(1); expect(after.invoice.balancePence).toBe(120000);
  });

  it("split credits cannot exceed original net principal", async () => {
    const f = await freshInvoice();
    const first = await credit(f,10001), second = await credit(f,10002);
    const before = await effects(f.jobId);
    const view = await repo.creditView(context,f.jobId,f.invoiceId);
    expect(view.invoice).toMatchObject({netPence:20003,taxPence:4001,totalPence:24004,balancePence:0});
    expect(view.credits.reduce((n,c)=>n-c.netPence,0)).toBe(20003);
    expect(view.credits.reduce((n,c)=>n-c.totalPence,0)).toBe(24004);
    const input = {jobId:f.jobId,invoiceId:f.invoiceId,netPence:1,reason:"Synthetic last penny"};
    await expect(repo.previewCredit(context,input)).rejects.toThrow("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
    // Supply the hash the old gross-only preview would return to test issuance
    // independently of the preview refusal. No stored hash is altered.
    const previewHash = createHash("sha256").update(`${f.jobId}${f.invoiceId}1${view.invoice.creditedPence}${view.invoice.pdfSha256}`).digest("hex");
    await expect(repo.issueCredit(context,{...input,actorMembershipId:M,commandId:randomUUID(),previewHash})).rejects.toThrow("CREDIT_EXCEEDS_AVAILABLE_AMOUNT");
    expect(await effects(f.jobId)).toEqual(before);
    expect(await repo.issueCredit(context,first.command)).toEqual(first.result);
    expect(await repo.issueCredit(context,second.command)).toEqual(second.result);
    await expect(repo.issueCredit(context,{...first.command,netPence:1})).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  });

  it("revised account cannot rebill previously invoiced scope", async () => {
    const f = await freshInvoice(110000,22000), next = await nextRevision(f,120000,24000);
    const before = await effects(f.jobId);
    await expect(repo.issue(context,issue(f.jobId,next))).rejects.toThrow("INVOICE_CORRECTION_OR_SUPPLEMENTARY_REQUIRED");
    expect(await effects(f.jobId)).toEqual(before);
    const invoices = await repo.list(context,f.jobId);
    expect(invoices).toHaveLength(1);
    expect(invoices.reduce((n,i)=>n+i.netPence,0)).toBeLessThanOrEqual(120000);
  });

  it("rechecks credited net after waiting for the issuer's transaction lock", async () => {
    const f = await freshInvoice(); await credit(f,10001);
    const pending = {jobId:f.jobId,invoiceId:f.invoiceId,netPence:10002,reason:"Synthetic pending correction"};
    const preview = await repo.previewCredit(context,pending);
    const holder = await writer.connect();
    let settled = false;
    try {
      await holder.query("BEGIN");
      await holder.query(`SELECT set_config('app.tenant_id',$1,true)`,[T]);
      // The stored issuer takes and retains the exact advisory xact lock.
      await holder.query(`SELECT * FROM app.issue_practice_customer_credit_note($1,$2,$3,$4,$5,$6,$7,$8)`,
        [T,f.jobId,f.invoiceId,M,randomUUID(),pending.netPence,pending.reason,preview.previewHash]);
      const invoice = (await repo.list(context,f.jobId))[0]!;
      const hash = createHash("sha256").update(`${f.jobId}${f.invoiceId}124003${invoice.pdfSha256}`).digest("hex");
      const result = repo.issueCredit(context,{jobId:f.jobId,invoiceId:f.invoiceId,netPence:1,reason:"Synthetic concurrent penny",
        actorMembershipId:M,commandId:randomUUID(),previewHash:hash}).then(
          () => { settled = true; return null; }, error => { settled = true; return error as Error; });
      let waiting = false;
      for(let i=0;i<100&&!waiting;i++) {
        waiting = (await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='invoice_audit_login' AND wait_event='advisory') waiting`)).rows[0].waiting;
        if(!waiting) await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true); expect(settled).toBe(false);
      await holder.query("COMMIT");
      expect(await result).toMatchObject({message:"CREDIT_EXCEEDS_AVAILABLE_AMOUNT"});
      expect((await repo.creditView(context,f.jobId,f.invoiceId)).credits.reduce((n,c)=>n-c.netPence,0)).toBe(20003);
    } finally { await holder.query("ROLLBACK"); holder.release(); }
  });

  it("a fully credited invoice is still not replaced by a second final; earlier command replays are preserved (per C135)", async () => {
    const f = await freshInvoice(10000,2000);
    const original = f.command;
    const originalInvoice = await repo.issue(context,original);
    await credit(f,5000);
    const next = await nextRevision(f,12000,2400);
    await expect(repo.issue(context,issue(f.jobId,next))).rejects.toThrow("INVOICE_CORRECTION_OR_SUPPLEMENTARY_REQUIRED");
    await credit(f,5000);
    // Was: the replacement issued. Now a second fresh main final is refused (the final lock binds the first revision only).
    await expect(repo.issue(context,issue(f.jobId,next))).rejects.toThrow("FINAL_INVOICE_REVISION_MISMATCH");
    expect((await repo.list(context,f.jobId)).filter(i=>i.finalAccountRevisionId===next)).toHaveLength(0);
    expect((await repo.issue(context,original)).id).toBe(originalInvoice.id);
    await expect(repo.issue(context,{...original,recipient:"changed@example.invalid"})).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  });

  it("concurrent revised issuance after a full credit is refused each time and bills nothing (per C135)", async () => {
    const f = await freshInvoice(10000,2000); await credit(f,10000);
    const next = await nextRevision(f,12000,2400);
    const commands = [issue(f.jobId,next),issue(f.jobId,next)];
    const results = await Promise.allSettled(commands.map(c=>repo.issue(context,c)));
    // Was: both calls returned the same replacement invoice. Now a second fresh main final is refused for each.
    expect(results.map(r=>r.status)).toEqual(["rejected","rejected"]);
    for (const r of results) expect(String((r as PromiseRejectedResult).reason)).toContain("FINAL_INVOICE_REVISION_MISMATCH");
    expect((await repo.list(context,f.jobId)).filter(i=>i.finalAccountRevisionId===next)).toHaveLength(0);
  });
});
