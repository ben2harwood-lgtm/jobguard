import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { RecordBuilderAcceptanceMutation } from "../src/acceptance-repository.js";
import { QuoteAcceptanceRepository } from "../src/acceptance-repository.js";
import { IssueQuoteMutation } from "../src/quote-document-repository.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { UserCommandDispatcher, type ConsequentialCommand } from "../src/commands.js";
import { prepareActivationFixtureV3, DEMO_TENANT_ID as T, DEMO_MEMBERSHIP_ID as M,
  DEMO_ACCOUNT_ID as A, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { authenticatePracticeSession, issuePracticeSession } from "../src/practice-session.js";
import { migrate } from "../src/migrate.js";
import { jobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { testBoundTenantContext } from "./tenant-context-test-utils.js";
import { snapshotRows } from "./upgrade-proof-utils.js";
import { loadMigrationProofs } from "./migration-proof-loader.js";

const own = "0743_builder_acceptance_sent_head.sql";
const sqlUrl = new URL(`../migrations/${own}`, import.meta.url);
const predecessorUrl = new URL("../migrations/0723_lp6c_money_binding.sql", import.meta.url);
const internal = "app.record_builder_attested_acceptance(uuid,uuid,uuid,uuid,uuid,integer,character,bigint,integer,uuid,character varying,character varying,timestamp with time zone,uuid)";
const at = new Date("2026-10-02T12:00:00.000Z");
const recipient = "fixture-customer@example.invalid";
type Database = Awaited<ReturnType<typeof jobDoorsDatabase>>;
type Context = Awaited<ReturnType<typeof testBoundTenantContext>>;
type Document = { documentId: string; hash: string; document: { documentVersion: number; totalPence: number; netPence: number }; pdf: Uint8Array };

const practiceDigests = new WeakMap<Context,string>();
async function seed(db: Database) {
  await db.owner.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [T]);
  await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1)", [U]);
  await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional sent-head builder')", [T,A]);
  await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [T,M,A,U]);
  const auth=await authenticatePracticeSession(db.runtime,await issuePracticeSession(db.runtime));
  practiceDigests.set(auth.context,auth.digest);
  return auth.context;
}
async function fixture(db: Database, context: Context) {
  const job = await prepareActivationFixtureV3(db.owner,context,`Fictional sent head ${randomUUID()}`,100000,db.runtime,100000,practiceDigests.get(context)!);
  const repo = new QuoteAcceptanceRepository(db.runtime);
  const view = await repo.view(context,job), d = view.activeAcceptance!;
  await repo.disposition(context,job,{ commandId:randomUUID(),documentId:d.documentId,documentHash:d.documentHash,
    documentVersion:d.documentVersion,kind:"acceptance_cancelled",occurredAt:at.toISOString() });
  const artifact = await new QuoteDeliveryRepository(db.runtime).pdf(context,job,d.documentId);
  return { job, old: { documentId:d.documentId,hash:d.documentHash,pdf:artifact.pdf,
    document:{documentVersion:d.documentVersion,netPence:d.netPence,totalPence:d.totalPence} } satisfies Document };
}
async function preview(db: Database, context: Context, job: string, net = 200000) {
  const repo = new QuoteRepository(db.runtime), workspace = await repo.readWorkspace(context,job);
  const previous = workspace.revisions.at(-1)!;
  await repo.saveDraft(context,{jobId:job,draftId:workspace.draft!.id,expectedRevision:workspace.draft!.revision,
    currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",effectiveAt:at,
    lines:previous.lines.map((line: Record<string,unknown>)=>({...line,id:randomUUID(),unitRatePence:net}))});
  return new QuoteDeliveryRepository(db.runtime).preview(context,job,recipient);
}
function send(db: Database, context: Context, job: string, d: Document) {
  return new QuoteDeliveryRepository(db.runtime).issue(context,job,{commandId:randomUUID(),documentId:d.documentId,contentHash:d.hash,recipient});
}
async function acceptance(db: Database, job: string, d: Document) {
  const revision = (await db.owner.query("SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2",[T,job])).rows[0].revision;
  const input = { version:"quote-acceptance.v1",acceptanceId:randomUUID(),jobId:job,documentId:d.documentId,
    documentVersion:d.document.documentVersion,documentHash:d.hash,expectedJobRevision:revision,
    acceptedTotalPence:d.document.totalPence,statedCustomerName:"Fictional customer",statedMethod:"email",acceptedAt:at,evidenceId:null };
  const command: ConsequentialCommand = {version:"command.v1",commandId:randomUUID(),commandType:"quote.acceptance.attest",
    semanticKey:`sent-head:${randomUUID()}`,actorMembershipId:M,subjectType:"quote_document",subjectRef:d.documentId,
    action:{actionType:"quote.acceptance.attest",recipient:input.statedCustomerName,contentHash:d.hash,
      aggregateRevision:d.document.documentVersion,amountPence:input.acceptedTotalPence,currency:"GBP",
      policyVersion:"builder-attestation.v1",expiresAt:new Date("2099-01-01")}};
  return {input,command,mutation:new RecordBuilderAcceptanceMutation(T,input)};
}
const dispatch = (db: Database,context: Context,f: Awaited<ReturnType<typeof acceptance>>) =>
  new UserCommandDispatcher(db.runtime).dispatch(context,f.command,f.mutation);

async function catalog(pool: Pool) {
  return (await pool.query(`SELECT oid::text,pg_get_userbyid(proowner) owner,proacl::text,prosecdef,proconfig,
    has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,
    CASE WHEN pronargs=16 THEN pg_get_functiondef(oid) END wrapper
    FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname='record_builder_attested_acceptance' ORDER BY pronargs`)).rows;
}
function gate() {
  let release!:()=>void;
  const promise = new Promise<void>(resolve=>{release=resolve;});
  return {promise,release};
}
async function blocked(pool: Pool, pid: number) {
  const deadline = Date.now()+10000;
  while(Date.now()<deadline) {
    if((await pool.query("SELECT cardinality(pg_blocking_pids($1))>0 blocked",[pid])).rows[0].blocked)return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error(`Expected backend ${pid} to wait on the job lock`);
}

// These checks require no PostgreSQL and also prevent accidentally replacing the wrapper.
describe("sent-head migration structure",()=>{
  it("copies the latest internal body with only the sent-head guard, preserving every prior check",async()=>{
    const predecessor = await readFile(predecessorUrl,"utf8"), sql = await readFile(sqlUrl,"utf8");
    const start = predecessor.indexOf("CREATE OR REPLACE FUNCTION app.record_builder_attested_acceptance(");
    const body = predecessor.slice(start,predecessor.indexOf("\n\n-- Latest predecessor:",start));
    const withoutGuard = sql.replace(/ -- A preview alone[\s\S]*?END IF;\n/,"");
    expect(withoutGuard).toContain(body);
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|ALTER FUNCTION)\b/);
    expect(sql).toContain("sent.content_hash=newer.content_hash");
    expect(sql).toContain("newer.document_version>d.document_version");
    expect(loadMigrationProofs().proofs.find(p=>p.migration===own)).toEqual({migration:own,lp0:[],upgrade:[],tenancy:[]});
  });
});

describe("builder attestation sent head: real PostgreSQL",()=>{
  let db: Database, context: Context;
  const original = process.env.JOBGUARD_ENV;
  beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";db=await jobDoorsDatabase(true);context=await seed(db);},300000);
  afterAll(async()=>{await db?.close();if(original===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=original;});

  it("refuses fresh v1 after sent v2 atomically; freezes exactly v2 money/hash and replays once",async()=>{
    const f=await fixture(db,context), newer=await preview(db,context,f.job);
    await send(db,context,f.job,newer);
    const old=await acceptance(db,f.job,f.old), before=await snapshotRows(db.owner);
    await expect(dispatch(db,context,old)).rejects.toMatchObject({code:"22023",message:"stale or unissued exact quote"});
    // Includes versions, acceptance/sequence/event, operation use, receipts, audit heads and job bytes.
    expect(await snapshotRows(db.owner)).toEqual(before);
    const fresh=await acceptance(db,f.job,newer), result=await dispatch(db,context,fresh);
    expect(result).toMatchObject({documentHash:newer.hash,acceptedTotalPence:240000});
    expect((await db.owner.query("SELECT content_hash,net_value_pence FROM app.quote_version WHERE tenant_id=$1 AND id=$2",[T,newer.documentId])).rows[0])
      .toMatchObject({content_hash:newer.hash,net_value_pence:"200000"});
    const accepted=await snapshotRows(db.owner);
    expect(await dispatch(db,context,fresh)).toEqual(result);
    expect(await snapshotRows(db.owner)).toEqual(accepted);
  });

  it.each(["preview","other-job","other-tenant","unmatched-hash"])("ignores %s rather than inventing an unsent obsolescence rule",async mode=>{
    const f=await fixture(db,context);
    if(mode==="other-job"||mode==="other-tenant") {
      const other=await fixture(db,context), newer=await preview(db,context,other.job);
      await send(db,context,other.job,newer);
      if(mode==="other-tenant") {
        // Corrupt owner-only isolation fixture: move both document and send together,
        // with all normal FK/immutability triggers disabled solely in this transaction.
        const client=await db.owner.connect();
        try { await client.query("BEGIN; SET LOCAL session_replication_role=replica");
          const tenant=randomUUID();
          await client.query("UPDATE app.quote_document_version SET tenant_id=$1,job_id=$2 WHERE id=$3",[tenant,f.job,newer.documentId]);
          await client.query("UPDATE app.quote_send SET tenant_id=$1,job_id=$2 WHERE document_id=$3",[tenant,f.job,newer.documentId]);
          await client.query("COMMIT");
        } finally {await client.query("ROLLBACK");client.release();}
      }
    } else {
      const newer=await preview(db,context,f.job);
      if(mode==="unmatched-hash") {
        await send(db,context,f.job,newer);
        const client=await db.owner.connect();
        try {await client.query("BEGIN; SET LOCAL session_replication_role=replica");
          await client.query("UPDATE app.quote_send SET content_hash=$1 WHERE tenant_id=$2 AND document_id=$3",["f".repeat(64),T,newer.documentId]);
          await client.query("COMMIT");
        } finally {await client.query("ROLLBACK");client.release();}
      }
    }
    const fresh=await acceptance(db,f.job,f.old);
    expect(await dispatch(db,context,fresh)).toMatchObject({documentHash:f.old.hash,acceptedTotalPence:120000});
  });

  it("refuses an unsent candidate without recording any acceptance effects",async()=>{
    const f=await fixture(db,context), unsent=await preview(db,context,f.job);
    const a=await acceptance(db,f.job,unsent), before=await snapshotRows(db.owner);
    await expect(dispatch(db,context,a)).rejects.toMatchObject({code:"22023",message:"stale or unissued exact quote"});
    expect(await snapshotRows(db.owner)).toEqual(before);
  });

  it.each(["hash","total","revision","actor","tenant","evidence","session","worker","revoked","expired"])("retains %s refusal and rolls back every effect",async attack=>{
    const f=await fixture(db,context), fresh=await acceptance(db,f.job,f.old);
    const client=await db.owner.connect();
    if(["worker","revoked","expired","session"].includes(attack)) {
      if(attack==="session")await db.owner.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second'");
      else await db.owner.query(`UPDATE app.membership SET ${attack==="worker"?"role='worker'":attack==="revoked"?"revoked_at=clock_timestamp()":"expires_at=clock_timestamp()-interval '1 second'"} WHERE tenant_id=$1 AND id=$2`,[T,M]);
    }
    const before=await snapshotRows(db.owner);
    try {
      await expect(new UserCommandDispatcher(db.runtime).dispatch(context,fresh.command,{
        inputHash:c=>fresh.mutation.inputHash(c),async mutate(database,c){
          const i=fresh.input;
          return (await database.$client.query("SELECT * FROM app.record_builder_attested_acceptance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
            [attack==="tenant"?randomUUID():T,i.acceptanceId,randomUUID(),i.jobId,i.documentId,i.documentVersion,
              attack==="hash"?"e".repeat(64):i.documentHash,attack==="total"?120001:i.acceptedTotalPence,
              attack==="revision"?999:i.expectedJobRevision,attack==="actor"?randomUUID():M,i.statedCustomerName,
              i.statedMethod,i.acceptedAt,attack==="evidence"?randomUUID():null,c.commandId,c.authorizationId])).rows[0];
        }})).rejects.toBeTruthy();
      expect(await snapshotRows(db.owner)).toEqual(before);
    } finally {
      await client.query("UPDATE app.membership SET role='owner',revoked_at=NULL,expires_at=NULL WHERE tenant_id=$1 AND id=$2",[T,M]);
      await client.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()+interval '1 hour'");
      client.release();
    }
  });

  it("retains supersession, duplicate active acceptance and cancellation boundaries",async()=>{
    const f=await fixture(db,context), repo=new QuoteAcceptanceRepository(db.runtime);
    await repo.disposition(context,f.job,{commandId:randomUUID(),documentId:f.old.documentId,documentHash:f.old.hash,
      documentVersion:f.old.document.documentVersion,kind:"superseded",occurredAt:at.toISOString()});
    const before=await snapshotRows(db.owner);
    await expect(dispatch(db,context,await acceptance(db,f.job,f.old))).rejects.toMatchObject({code:"22023"});
    expect(await snapshotRows(db.owner)).toEqual(before);
    const clean=await fixture(db,context), first=await acceptance(db,clean.job,clean.old);
    await dispatch(db,context,first);
    await expect(dispatch(db,context,await acceptance(db,clean.job,clean.old))).rejects.toMatchObject({code:"22023"});
    await repo.disposition(context,clean.job,{commandId:randomUUID(),documentId:clean.old.documentId,documentHash:clean.old.hash,
      documentVersion:clean.old.document.documentVersion,kind:"acceptance_cancelled",occurredAt:at.toISOString()});
    expect(await dispatch(db,context,await acceptance(db,clean.job,clean.old))).toMatchObject({documentHash:clean.old.hash});
  });

  it.each(["invoice","credit_note","payment"])("retains the explicit-cancellation reacceptance prohibition with %s",async kind=>{
    const f=await fixture(db,context), a=await acceptance(db,f.job,f.old), before=await snapshotRows(db.owner);
    await expect(new UserCommandDispatcher(db.owner).dispatch(context,a.command,{
      inputHash:c=>a.mutation.inputHash(c),async mutate(d,c){
        const invoice=randomUUID(), authorization=randomUUID();
        // Owner-only corrupt-history fixture, matching the existing reacceptance suite.
        // The whole command rolls back; no simulated billing facts escape this test.
        await d.$client.query("SET LOCAL session_replication_role=replica");
        await d.$client.query("INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark) VALUES($1,$2,$3,$4,$5,$6,'2026-10-01','{}','candidate_m1_standard_v1','GBP',100,20,120,$7,$7,'\\x00',true,'SYNTHETIC - NOT A REAL INVOICE')",
          [invoice,T,kind==="invoice"?f.job:randomUUID(),randomUUID(),authorization,`SENT-HEAD-${randomUUID().slice(0,8)}`,"a".repeat(64)]);
        if(kind==="credit_note")await d.$client.query("INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,currency,reason,net_pence,tax_pence,total_pence) VALUES($1,$2,$3,$4,$5,'SENT-HEAD-CN',120,'GBP','synthetic',-100,-20,-120)",[randomUUID(),T,f.job,invoice,authorization]);
        if(kind==="payment")await d.$client.query("INSERT INTO app.customer_payment(id,tenant_id,job_id,invoice_id,authorization_id,paid_on,amount_pence,currency,method,reference,builder_attested,provenance) VALUES($1,$2,$3,$4,$5,'2026-10-02',120,'GBP','cash','SENT-HEAD-PAY',true,'manual_builder_attestation')",[randomUUID(),T,f.job,invoice,authorization]);
        await d.$client.query("SET LOCAL session_replication_role=origin");
        return a.mutation.mutate(d,c);
      }
    })).rejects.toMatchObject({code:"22023",message:"reacceptance refused: customer billing exists"});
    expect(await snapshotRows(db.owner)).toEqual(before);
  });

  it("preserves exact successful replay after cancellation and a newer send, but refuses fresh reuse",async()=>{
    const f=await fixture(db,context), a=await acceptance(db,f.job,f.old), result=await dispatch(db,context,a);
    await new QuoteAcceptanceRepository(db.runtime).disposition(context,f.job,{commandId:randomUUID(),documentId:f.old.documentId,
      documentHash:f.old.hash,documentVersion:f.old.document.documentVersion,kind:"acceptance_cancelled",occurredAt:at.toISOString()});
    const newer=await preview(db,context,f.job);await send(db,context,f.job,newer);
    const before=await snapshotRows(db.owner);
    expect(await dispatch(db,context,a)).toEqual(result);
    await expect(dispatch(db,context,await acceptance(db,f.job,f.old))).rejects.toMatchObject({code:"22023"});
    expect(await snapshotRows(db.owner)).toEqual(before);
  });

  it("does not create an accepted quote_version for a previously unaccepted stale sent document",async()=>{
    const f=await fixture(db,context), second=await preview(db,context,f.job);await send(db,context,f.job,second);
    const third=await preview(db,context,f.job,300000);await send(db,context,f.job,third);
    expect((await db.owner.query("SELECT 1 FROM app.quote_version WHERE tenant_id=$1 AND id=$2",[T,second.documentId])).rowCount).toBe(0);
    const a=await acceptance(db,f.job,second), before=await snapshotRows(db.owner);
    await expect(dispatch(db,context,a)).rejects.toMatchObject({code:"22023",message:"stale or unissued exact quote"});
    expect(await snapshotRows(db.owner)).toEqual(before);
  });

  it.each(["send-first","accept-first"])("serializes %s using actual send/acceptance mutations on two connections",async order=>{
    const f=await fixture(db,context), newer=await preview(db,context,f.job), a=await acceptance(db,f.job,f.old);
    const mutation=new IssueQuoteMutation({tenantId:T,jobId:f.job,documentId:newer.documentId,outboxActionId:randomUUID(),
      recipients:[recipient],immutableContent:new TextDecoder().decode(newer.pdf)});
    const command: ConsequentialCommand={version:"command.v1",commandId:randomUUID(),commandType:"quote.send",
      semanticKey:`quote-send:${newer.documentId}`,actorMembershipId:M,subjectType:"quote_document",subjectRef:newer.documentId,
      action:{actionType:"quote.send",recipient:JSON.stringify([recipient]),contentHash:newer.hash,
        aggregateRevision:newer.document.documentVersion,amountPence:null,currency:null,policyVersion:"free-quote-send.v1",expiresAt:new Date("2099-01-01")}};
    const held=gate(), release=gate(), started=gate();let pid=0;
    const dispatcher=new UserCommandDispatcher(db.runtime);
    const first=order==="send-first"?dispatcher.dispatch(context,command,{
      lock:(d,c)=>mutation.lock(d,c),async mutate(d,c){const result=await mutation.mutate(d,c);held.release();await release.promise;return result;}
    }):dispatcher.dispatch(context,a.command,{
      inputHash:c=>a.mutation.inputHash(c),async mutate(d,c){const result=await a.mutation.mutate(d,c);held.release();await release.promise;return result;},
      auditEvents:(r,c)=>a.mutation.auditEvents(r,c)
    });
    let second: Promise<unknown>|undefined;
    try {
      await Promise.race([held.promise,first.then(()=>{throw new Error("First transaction did not pause");})]);
      second=order==="send-first"?dispatcher.dispatch(context,a.command,{
        inputHash:c=>a.mutation.inputHash(c),async mutate(d,c){pid=(await d.$client.query("SELECT pg_backend_pid() pid")).rows[0].pid;started.release();return a.mutation.mutate(d,c);}
      }):dispatcher.dispatch(context,command,{
        lock:(d,c)=>mutation.lock(d,c),async mutate(d,c){pid=(await d.$client.query("SELECT pg_backend_pid() pid")).rows[0].pid;started.release();return mutation.mutate(d,c);}
      });
      // Attach the rejection handler before releasing either transaction.
      const outcome=Promise.allSettled([first,second]);
      await Promise.race([started.promise,second.then(()=>{throw new Error("Second transaction did not reach mutation");})]);
      await blocked(db.owner,pid);
      release.release();
      const results=await outcome;
      expect(results[0].status).toBe("fulfilled");
      if(order==="send-first")expect(results[1]).toMatchObject({status:"rejected",reason:{code:"22023",message:"stale or unissued exact quote"}});
      else expect(results[1].status).toBe("fulfilled");
      const active=(await new QuoteAcceptanceRepository(db.runtime).view(context,f.job)).activeAcceptance;
      expect(active?.documentId??null).toBe(order==="send-first"?null:f.old.documentId);
    } finally {release.release();await Promise.allSettled([first,...(second?[second]:[])]);}
  });

  it("the stale regression detects removal of the guard, restoring the function afterwards",async()=>{
    const f=await fixture(db,context), newer=await preview(db,context,f.job);await send(db,context,f.job,newer);
    const definition=(await db.owner.query("SELECT pg_get_functiondef($1::regprocedure) definition",[internal])).rows[0].definition as string;
    const mutant=definition.replace(/ -- A preview alone[\s\S]*?END IF;\n/,"");
    expect(mutant).not.toBe(definition);
    const regression=async()=>{
      const a=await acceptance(db,f.job,f.old);
      await expect(new UserCommandDispatcher(db.runtime).dispatch(context,a.command,{
        inputHash:c=>a.mutation.inputHash(c),async mutate(d,c){await a.mutation.mutate(d,c);throw new Error("MUTANT_ACCEPTED_OLD_SENT_QUOTE");}
      })).rejects.toMatchObject({code:"22023",message:"stale or unissued exact quote"});
    };
    await regression();
    const before=await snapshotRows(db.owner);
    try {await db.owner.query(mutant);await expect(regression()).rejects.toThrow();}
    finally {await db.owner.query(definition);}
    await regression();expect(await snapshotRows(db.owner)).toEqual(before);
  });
});

describe("0745 populated predecessor upgrade",()=>{
  let db: Database, context: Context;
  const original=process.env.JOBGUARD_ENV;
  beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";db=await jobDoorsDatabase(true,own);context=await seed(db);},300000);
  afterAll(async()=>{await db?.close();if(original===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=original;});
  it("proves the predecessor defect, preserves every populated row and ACL, and then refuses it",async()=>{
    const history=await fixture(db,context), f=await fixture(db,context), newer=await preview(db,context,f.job);
    await send(db,context,f.job,newer);
    const a=await acceptance(db,f.job,f.old);
    // Failing-first behavioral witness: the predecessor accepts a stale sent v1.
    // Roll back the witness so upgrade starts with the original history intact.
    await expect(new UserCommandDispatcher(db.runtime).dispatch(context,a.command,{
      inputHash:c=>a.mutation.inputHash(c),async mutate(d,c){
        expect(await a.mutation.mutate(d,c)).toMatchObject({documentHash:f.old.hash});
        throw new Error("PREDECESSOR_ACCEPTED_STALE_SENT_QUOTE");
      }
    })).rejects.toThrow("PREDECESSOR_ACCEPTED_STALE_SENT_QUOTE");
    const before=await snapshotRows(db.owner), acl=await catalog(db.owner);
    await migrate(db.owner);
    // LP-6d's later migration creates identity.lp6d_sso_grant_permit empty.
    const upgraded=await snapshotRows(db.owner);
    expect(upgraded).toEqual({...before,"identity.lp6d_sso_grant_permit":[]});
    expect(await catalog(db.owner)).toEqual(acl);
    expect(acl.map(r=>r.runtime)).toEqual([false,true]);
    expect(acl.every(r=>r.owner==="jobguard_migration"&&r.prosecdef)).toBe(true);
    await expect(dispatch(db,context,a)).rejects.toMatchObject({code:"22023",message:"stale or unissued exact quote"});
    expect(await snapshotRows(db.owner)).toEqual(upgraded);
    await dispatch(db,context,await acceptance(db,f.job,newer));
    await dispatch(db,context,await acceptance(db,history.job,history.old));
  });
});
