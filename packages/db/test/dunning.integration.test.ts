import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { DunningRepository } from "../src/dunning-repository.js";
import { migrate } from "../src/migrate.js";
import { verifyAuditChain, type AuditEvent } from "../src/audit.js";

describe("M4-16 durable synthetic dunning",()=>{
 let c:Cluster;
 beforeAll(async()=>{c=await cluster();},240000);
 afterAll(async()=>{await c?.close();});
 const company=()=>meterCompany(c as unknown as WorkFixture);
 type Company=Awaited<ReturnType<typeof company>>;
 async function seed(a:Company, changed:Record<string,unknown>={}) {
  const projection={version:"dunning-invoice.v1",environment:"synthetic_demo",tenantId:a.tenantId,jobId:a.jobId,invoiceId:randomUUID(),
   revision:1,sourceRevision:1,sourceHash:"a".repeat(64),sourceState:"issued_invoice",finalAccountLockId:null,currency:"GBP",originalPence:10000,outstandingPence:10000,
   dueTick:1,category:"customer",recipient:"fictional@example.invalid",pilotNoCharge:false,disputed:false,refundPending:false,reversed:false,cancelled:false,attemptState:"none",...changed};
  await c.admin.query("INSERT INTO app.dunning_invoice(tenant_id,job_id,invoice_id,projection) VALUES($1,$2,$3,$4::jsonb)",[a.tenantId,a.jobId,projection.invoiceId,JSON.stringify(projection)]);
  return projection;
 }
 const read=(a:Company)=>new DunningRepository(c.runtime).read(a.context,a.digest,{jobId:a.jobId,nowTick:3});
 const command=(row:{invoiceId:string;snapshotHash:string}, extra={})=>({version:"dunning-persist-command.v1",commandId:randomUUID(),invoiceId:row.invoiceId,snapshotHash:row.snapshotHash,nowTick:3,...extra});
 it("refuses client-forged future eligibility at the repository and direct SQL boundaries",async()=>{
  const a=await company();await seed(a,{dueTick:Date.now()+86400000});
  const repo=new DunningRepository(c.runtime), rows=await repo.read(a.context,a.digest,{jobId:a.jobId,nowTick:Number.MAX_SAFE_INTEGER});
  const row=rows.invoices[0]!;
  expect(row).toMatchObject({suppression:"not_due",reminder:null});
  for(const operation of ["request","approve"] as const){
   const input=command(row,{nowTick:Number.MAX_SAFE_INTEGER,...(operation==="approve"?{decisionId:randomUUID()}:{})});
   await expect(repo.command(a.context,a.digest,a.jobId,operation,input)).rejects.toThrow("DUNNING_UNAVAILABLE");
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query("SELECT app.dunning_workbench($1,$2,$3,$4,$5::jsonb)",
    [a.tenantId,a.digest,a.jobId,operation,JSON.stringify(input)]))).rejects.toThrow("DUNNING_UNAVAILABLE");
  }
  expect((await c.admin.query("SELECT count(*)::int n FROM app.dunning_reminder WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
 });
 it("allows database-time overdue requests and approvals despite a past client tick",async()=>{
  const a=await company();await seed(a,{dueTick:Date.now()-86400000});
  const row=(await read(a)).invoices[0]!;expect(row.reminder).not.toBeNull();
  const request=command(row,{nowTick:0});
  const draft=(await workTenant(c.runtime,a.tenantId,db=>db.query("SELECT app.dunning_workbench($1,$2,$3,'request',$4::jsonb) result",
   [a.tenantId,a.digest,a.jobId,JSON.stringify(request)]))).rows[0].result;
  expect(draft.status).toBe("pending");
  const approved=await new DunningRepository(c.runtime).command(a.context,a.digest,a.jobId,"approve",command(row,{nowTick:0,decisionId:draft.decisionId}));
  expect(approved).toMatchObject({status:"approved",executable:false});
 });
 it("survives repository recreation, deduplicates concurrent drafts and approvals, and audits once per command",async()=>{
  const a=await company();await seed(a);const row=(await read(a)).invoices[0]!;
  const repo=new DunningRepository(c.runtime), input=command(row);
  const [first,replay]=await Promise.all([repo.command(a.context,a.digest,a.jobId,"request",input),repo.command(a.context,a.digest,a.jobId,"request",input)]);
  expect(replay).toEqual(first);expect(first.status).toBe("pending");
  const other=await new DunningRepository(c.runtime).command(a.context,a.digest,a.jobId,"request",command(row));
  expect(other.decisionId).toBe(first.decisionId);
  const approve=command(row,{decisionId:first.decisionId});
  const approved=await new DunningRepository(c.runtime).command(a.context,a.digest,a.jobId,"approve",approve);
  expect(approved).toMatchObject({status:"approved",executable:false});
  expect(await repo.command(a.context,a.digest,a.jobId,"approve",approve)).toEqual(approved);
  const counts=await c.admin.query("SELECT (SELECT count(*)::int FROM app.dunning_reminder WHERE tenant_id=$1) drafts,(SELECT count(*)::int FROM app.decision_resolution WHERE tenant_id=$1) resolutions,(SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'dunning.%') audits",[a.tenantId]);
  expect(counts.rows[0]).toEqual({drafts:1,resolutions:1,audits:3});
  const events=(await c.admin.query<AuditEvent>(`SELECT id,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",payload,tenant_id AS "tenantId",sequence::int,occurred_at AS "occurredAt",payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`,[a.tenantId])).rows;
  verifyAuditChain(events);
  await migrate(c.admin);expect((await read(a)).invoices[0]!.snapshotHash).toBe(row.snapshotHash);
 });
 it.each([{disputed:true},{reversed:true},{outstandingPence:0},{pilotNoCharge:true},{refundPending:true},{attemptState:"pending"},{attemptState:"outcome_unknown"}])("does not draft suppressed amounts %j",async changed=>{
  const a=await company(), p=await seed(a,changed);
  const hash=(await c.admin.query("SELECT app.final_lock_hash(projection) h FROM app.dunning_invoice WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,p.invoiceId])).rows[0].h;
  const input=command({invoiceId:p.invoiceId,snapshotHash:hash});
  await expect(new DunningRepository(c.runtime).command(a.context,a.digest,a.jobId,"request",input)).rejects.toThrow("DUNNING_UNAVAILABLE");
  // Attack the SQL boundary as well as the repository preflight.
  await expect(workTenant(c.runtime,a.tenantId,db=>db.query("SELECT app.dunning_workbench($1,$2,$3,'request',$4::jsonb)",[a.tenantId,a.digest,a.jobId,JSON.stringify(input)]))).rejects.toThrow("DUNNING_UNAVAILABLE");
 });
 it("invalidates old approvals on changed balances, preserving old Decisions and regenerating drafts",async()=>{
  const a=await company(),p=await seed(a),repo=new DunningRepository(c.runtime),row=(await read(a)).invoices[0]!;
  const old=await repo.command(a.context,a.digest,a.jobId,"request",command(row));
  const approve=command(row,{decisionId:old.decisionId});await repo.command(a.context,a.digest,a.jobId,"approve",approve);
  await c.admin.query("UPDATE app.dunning_invoice SET projection=$3::jsonb WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,p.invoiceId,JSON.stringify({...p,revision:2,outstandingPence:5000})]);
  await expect(repo.command(a.context,a.digest,a.jobId,"approve",approve)).rejects.toThrow("DUNNING_UNAVAILABLE");
  const next=(await read(a)).invoices[0]!;expect(next.reminder?.amount.pence).toBe(5000);
  await expect(repo.command(a.context,a.digest,a.jobId,"approve",command(next,{decisionId:old.decisionId}))).rejects.toThrow("DUNNING_UNAVAILABLE");
  expect((await repo.command(a.context,a.digest,a.jobId,"request",command(next))).decisionId).not.toBe(old.decisionId);
 });
 it("refuses wrong Decisions, tenant/session substitutions, conflicting replays and expired sessions",async()=>{
  const a=await company(),b=await company();await seed(a);const repo=new DunningRepository(c.runtime),row=(await read(a)).invoices[0]!;
  const input=command(row);await repo.command(a.context,a.digest,a.jobId,"request",input);
  await expect(repo.command(a.context,a.digest,a.jobId,"approve",command(row,{decisionId:randomUUID()}))).rejects.toThrow("DUNNING_UNAVAILABLE");
  await seed(b);const foreignRow=(await read(b)).invoices[0]!;
  const foreign=await repo.command(b.context,b.digest,b.jobId,"request",command(foreignRow));
  await expect(repo.command(a.context,a.digest,a.jobId,"approve",command(row,{decisionId:foreign.decisionId}))).rejects.toThrow("DUNNING_UNAVAILABLE");
  await expect(repo.read(b.context,a.digest,{jobId:a.jobId,nowTick:3})).rejects.toThrow("DUNNING_UNAVAILABLE");
  await expect(repo.command(a.context,a.digest,a.jobId,"request",{...input,nowTick:4})).rejects.toThrow("DUNNING_CONFLICT");
  await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
  await expect(repo.command(a.context,a.digest,a.jobId,"request",input)).rejects.toThrow("DUNNING_UNAVAILABLE");
 });
 it.each(["expired","expired_approved","dismissed","rejected"])("redrafts after %s while refusing the old Decision",async state=>{
  const a=await company();await seed(a);const row=(await read(a)).invoices[0]!,did=randomUUID();
  await c.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'dunning_invoice',$3,'dunning.reminder.preview')",[did,a.tenantId,row.invoiceId]);
  await c.admin.query(`INSERT INTO app.dunning_reminder(tenant_id,job_id,invoice_id,decision_id,snapshot_hash,snapshot,expires_at)
   SELECT tenant_id,job_id,invoice_id,$3,$4,projection,clock_timestamp()+(CASE WHEN $5 LIKE 'expired%' THEN interval '-1 hour' ELSE interval '1 hour' END)
   FROM app.dunning_invoice WHERE tenant_id=$1 AND invoice_id=$2`,[a.tenantId,row.invoiceId,did,row.snapshotHash,state]);
  if(state!=="expired")await c.admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,$4,$5)",[randomUUID(),a.tenantId,did,state==="expired_approved"?"approved":state,a.actorId]);
  const repo=new DunningRepository(c.runtime), oldApproval=command(row,{decisionId:did});
  await expect(repo.command(a.context,a.digest,a.jobId,"approve",oldApproval)).rejects.toThrow("DUNNING_UNAVAILABLE");
  const [fresh,concurrent]=await Promise.all([repo.command(a.context,a.digest,a.jobId,"request",command(row)),repo.command(a.context,a.digest,a.jobId,"request",command(row))]);
  expect(fresh.decisionId).not.toBe(did);expect(fresh.status).toBe("pending");
  expect(concurrent.decisionId).toBe(fresh.decisionId);
  await expect(repo.command(a.context,a.digest,a.jobId,"approve",oldApproval)).rejects.toThrow("DUNNING_UNAVAILABLE");
  expect(await repo.command(a.context,a.digest,a.jobId,"approve",command(row,{decisionId:fresh.decisionId}))).toMatchObject({status:"approved",executable:false});
  const history=(await c.admin.query("SELECT decision_id,status FROM app.dunning_reminder WHERE tenant_id=$1 ORDER BY decision_id",[a.tenantId])).rows;
  expect(history).toHaveLength(2);
  expect(history).toEqual(expect.arrayContaining([
   {decision_id:did,status:state.startsWith("expired")?"expired":state},{decision_id:fresh.decisionId,status:"approved"}
  ]));
 });
 it("refuses replay of a dismissed request and retains immutable snapshots",async()=>{
  const a=await company();await seed(a);const row=(await read(a)).invoices[0]!,repo=new DunningRepository(c.runtime),input=command(row);
  const old=await repo.command(a.context,a.digest,a.jobId,"request",input);
  await c.admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'dismissed',$4)",[randomUUID(),a.tenantId,old.decisionId,a.actorId]);
  await expect(repo.command(a.context,a.digest,a.jobId,"request",input)).rejects.toThrow("DUNNING_UNAVAILABLE");
  const fresh=await repo.command(a.context,a.digest,a.jobId,"request",command(row));
  expect(fresh.decisionId).not.toBe(old.decisionId);
  await expect(repo.command(a.context,a.digest,a.jobId,"request",input)).rejects.toThrow("DUNNING_UNAVAILABLE");
  await expect(c.admin.query("UPDATE app.dunning_reminder SET snapshot='{}' WHERE tenant_id=$1",[a.tenantId])).rejects.toMatchObject({code:"55000"});
  await expect(c.admin.query("UPDATE app.dunning_reminder SET expires_at=clock_timestamp()+interval '1 day' WHERE tenant_id=$1",[a.tenantId])).rejects.toMatchObject({code:"55000"});
 });
 it.each(["pending","approved"])("database refuses a second %s draft for the same snapshot",async status=>{
  const index=(await c.admin.query("SELECT indisunique,pg_get_expr(indpred,indrelid) predicate FROM pg_index WHERE indexrelid='app.dunning_reminder_live_snapshot'::regclass")).rows[0];
  expect(index).toEqual({indisunique:true,predicate:"(status = ANY (ARRAY['pending'::text, 'approved'::text]))"});
  const a=await company();await seed(a);const row=(await read(a)).invoices[0]!,repo=new DunningRepository(c.runtime);
  const first=await repo.command(a.context,a.digest,a.jobId,"request",command(row));
  if(status==="approved")await repo.command(a.context,a.digest,a.jobId,"approve",command(row,{decisionId:first.decisionId}));
  const did=randomUUID();
  await c.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'dunning_invoice',$3,'dunning.reminder.preview')",[did,a.tenantId,row.invoiceId]);
  await expect(c.admin.query(`INSERT INTO app.dunning_reminder(tenant_id,job_id,invoice_id,decision_id,snapshot_hash,snapshot,status)
   SELECT tenant_id,job_id,invoice_id,$3,snapshot_hash,snapshot,$4 FROM app.dunning_reminder WHERE tenant_id=$1 AND decision_id=$2`,[a.tenantId,first.decisionId,did,status])).rejects.toMatchObject({code:"23505"});
 });
 it.each([{disputed:true},{outstandingPence:0}])("refuses redrafting and old approvals after suppression %j",async changed=>{
  const a=await company(),p=await seed(a),row=(await read(a)).invoices[0]!,repo=new DunningRepository(c.runtime);
  const old=await repo.command(a.context,a.digest,a.jobId,"request",command(row));
  const approval=command(row,{decisionId:old.decisionId});
  await repo.command(a.context,a.digest,a.jobId,"approve",approval);
  await c.admin.query("UPDATE app.dunning_invoice SET projection=$3::jsonb WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,p.invoiceId,JSON.stringify({...p,...changed})]);
  const hash=(await c.admin.query("SELECT app.final_lock_hash(projection) h FROM app.dunning_invoice WHERE tenant_id=$1 AND invoice_id=$2",[a.tenantId,p.invoiceId])).rows[0].h;
  for(const [operation,input] of [["request",command({...row,snapshotHash:hash})],["approve",approval]] as const){
   await expect(repo.command(a.context,a.digest,a.jobId,operation,input)).rejects.toThrow("DUNNING_UNAVAILABLE");
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query("SELECT app.dunning_workbench($1,$2,$3,$4,$5::jsonb)",[a.tenantId,a.digest,a.jobId,operation,JSON.stringify(input)]))).rejects.toThrow("DUNNING_UNAVAILABLE");
  }
 });
 it("skips malformed rows and denies direct runtime reads/writes and cross-job references",async()=>{
  const a=await company(),b=await company();await seed(a);await seed(a,{outstandingPence:"malformed-secret"});
  const rows=await read(a);expect(rows.invoices).toHaveLength(1);expect(rows.skippedCount).toBe(1);expect(JSON.stringify(rows)).not.toContain("malformed-secret");
  await expect(workTenant(c.runtime,a.tenantId,db=>db.query("SELECT * FROM app.dunning_invoice"))).rejects.toMatchObject({code:"42501"});
  await expect(workTenant(c.runtime,a.tenantId,db=>db.query("UPDATE app.dunning_invoice SET projection='{}'"))).rejects.toMatchObject({code:"42501"});
  await expect(c.admin.query("INSERT INTO app.dunning_invoice(tenant_id,job_id,invoice_id,projection) VALUES($1,$2,$3,'{}')",[a.tenantId,b.jobId,randomUUID()])).rejects.toMatchObject({code:"23503"});
  const policies=(await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN('app.dunning_invoice'::regclass,'app.dunning_reminder'::regclass)")).rows;
  expect(policies).toEqual([{relrowsecurity:true,relforcerowsecurity:true},{relrowsecurity:true,relforcerowsecurity:true}]);
 });
});
