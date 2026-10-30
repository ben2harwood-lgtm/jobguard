import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { SimulationMoneyRunRepository } from "../src/simulation-money-run-repository.js";
import { SimulationFeeStatementRepository } from "../src/simulation-fee-statement-repository.js";
import { SimulationFeeCollectionRepository } from "../src/simulation-fee-collection-repository.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture } from "./final-check-fixture.js";
import { proofBefore,proofDifferences } from "./upgrade-proof-utils.js";
import { PracticeFeedRepository } from "../src/practice-feed-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { migrate } from "../src/migrate.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
let f:FinalCheckFixture,repo:SimulationMoneyRunRepository;
beforeAll(async()=>{f=await createFinalCheckFixture();repo=new SimulationMoneyRunRepository(f.runtime);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
const version="simulation-money-command.v1";
async function setup(){
 const x=await catchFeeFixture(f),review=await x.execute();
 await x.execute({version:"success-fee-command.v1",action:"approve",commandId:randomUUID(),expectedPostingRevision:0,reviewId:review.reviewId,statementHash:review.statementHash});
 return {...x,run:(raw:unknown={version,action:"run",commandId:randomUUID()})=>repo.command(x.context,x.jobId,x.auth.digest,raw)};
}
it("gathers persisted rows, reproduces hashes across rebuild/replay/paused checkpoint restore, and reviews without changing books",async()=>{
 const x=await setup(),command={version,action:"run",commandId:randomUUID()};
 const books=await proofBefore(f.admin,["customer_invoice","customer_payment","stored_receipt_case_allocation","success_fee_journal","platform_statement","subscription_period"].map(n=>`app.${n}`));
 const a=await x.run(command),b=await x.run();expect(a.sourceHash).toBe(b.sourceHash);expect(a.report).toEqual(b.report);
 expect(await x.run(command)).toEqual(a);
 const restored=await x.run({version,action:"restore",commandId:randomUUID(),runId:a.runId,sourceHash:a.sourceHash});expect(restored.paused).toBe(true);expect(restored.sourceHash).toBe(a.sourceHash);expect(restored.report).toEqual(a.report);
 const review={version,action:"review",commandId:randomUUID(),runId:a.runId,sourceHash:a.sourceHash};expect((await x.run(review)).report).toEqual(a.report);expect((await x.run(review)).report).toEqual(a.report);
 await migrate(f.admin);expect(await proofDifferences(f.admin,books)).toEqual({rows:[],types:[]});
 expect(a.snapshot.success_fee_journal.length).toBeGreaterThan(0);expect(a.report.differences.map(d=>d.code)).toContain("COLLECTION_POSTING_MISMATCH");
});
it("rejects fabricated sources, changed replay payloads, cross-job reads and revoked access before replay",async()=>{
 const x=await setup(),y=await setup(),c={version,action:"run",commandId:randomUUID()},a=await x.run(c);
 await expect(x.run({...c,snapshot:a.snapshot})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 await expect(x.run({...c,action:"restore",runId:a.runId,sourceHash:a.sourceHash})).rejects.toThrow("SUCCESS_FEE_IDEMPOTENCY_CONFLICT");
 await expect(y.run({version,action:"read",commandId:randomUUID(),runId:a.runId,sourceHash:a.sourceHash})).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(repo.command(testTenantContext(randomUUID()),x.jobId,x.auth.digest,c)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[x.auth.digest]);
 await expect(x.run(c)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
});
it("unknown events are visible; changed sources invalidate review/restore, and reversal exposes the missing compensation writer",async()=>{
 const x=await setup(),statements=new SimulationFeeStatementRepository(f.runtime),collection=new SimulationFeeCollectionRepository(f.runtime);
 const issued=await statements.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()});
 const a=await x.run();
 const attempt=await collection.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-collection-command.v1",action:"collect",commandId:randomUUID(),statementId:issued.statementId,statementHash:issued.documentHash,amountPence:8000});
 await collection.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-collection-command.v1",action:"unknown",commandId:randomUUID(),attemptId:attempt.attemptId});
 const unknown=await x.run();expect(unknown.report.differences).toEqual(expect.arrayContaining([expect.objectContaining({code:"OUTCOME_UNKNOWN",sourceRefs:[attempt.attemptId]})]));
 for(const action of ["review","restore"])await expect(x.run({version,action,commandId:randomUUID(),runId:a.runId,sourceHash:a.sourceHash})).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional reversal"});
 expect((await x.run()).report.differences.map(d=>d.code)).toContain("FEE_COMPENSATION_REQUIRED");
});
it("runtime and other roles cannot read/write/truncate run tables; migration role remains tenant-scoped",async()=>{
 const x=await setup();await x.run();
 for(const table of ["simulation_money_run","simulation_money_review"]){
  for(const sql of [`SELECT * FROM app.${table}`,`INSERT INTO app.${table} DEFAULT VALUES`,`TRUNCATE app.${table}`])await expect(f.runtime.query(sql)).rejects.toMatchObject({code:"42501"});
  for(const role of ["jobguard_runtime","jobguard_shadow","jobguard_infrastructure"])expect((await f.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role,`app.${table}`])).rows[0].allowed).toBe(false);
  expect(await finalCheckTenant(f.admin,randomUUID(),async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return (await db.query(`SELECT * FROM app.${table}`)).rows;})).toEqual([]);
  for(const verb of ["UPDATE","DELETE"]){const sql=verb==="UPDATE"?`UPDATE app.${table} SET job_id=job_id WHERE tenant_id=$1`:`DELETE FROM app.${table} WHERE tenant_id=$1`;await expect(finalCheckTenant(f.admin,x.context.tenantId,db=>db.query(sql,[x.context.tenantId]))).rejects.toThrow();}
 }
});
it("audit failure rolls back run and source receipt atomically",async()=>{
 const x=await setup(),c={version,action:"run",commandId:randomUUID()};
 await f.admin.query(`CREATE FUNCTION app.money_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='simulation_money.run' THEN RAISE EXCEPTION 'MONEY_TEST_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER money_test_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.money_test_audit_failure()`);
 try{await expect(x.run(c)).rejects.toThrow("MONEY_TEST_AUDIT_FAILURE");expect((await f.admin.query("SELECT id FROM app.simulation_money_run WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,c.commandId])).rows).toEqual([]);}
 finally{await f.admin.query("ALTER TABLE app.audit_event DISABLE TRIGGER money_test_audit_failure");}
 expect((await x.run(c)).runId).toBe(c.commandId);
});

it("raw SQL cannot supply a forged snapshot or reuse a run ID for review; incoming feed unknowns/orphans persist as specific rows",async()=>{
 const x=await setup(),c={version,action:"run",commandId:randomUUID()},saved=await x.run(c);
 await expect(withTenant(practiceMaterialPool(f.runtime,x.auth.digest),x.context,db=>db.$client.query("SELECT app.simulation_money_run($1,$2,$3::jsonb)",[x.jobId,x.auth.digest,{...c,snapshot:{},report:{label:"Records match within this simulation"}}]))).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 await expect(x.run({version,action:"review",commandId:c.commandId,runId:saved.runId,sourceHash:saved.sourceHash})).rejects.toThrow("SUCCESS_FEE_IDEMPOTENCY_CONFLICT");
 const feed=new PracticeFeedRepository(f.runtime,"synthetic_demo");
 for(const step of ["settled","unknown_duplicate"]){
  const view=await feed.view(x.context,x.actor,x.auth.digest,x.jobId);
  await feed.command(x.context,x.actor,x.auth.digest,x.jobId,{version:"practice-feed-command.v1",action:"advance",commandId:randomUUID(),expectedRevision:view.revision,movement:"receipt-384",step});
 }
 const result=await x.run();expect(result.report.label).toBe("Review needed");
 expect(result.report.differences.map(d=>d.code)).toEqual(expect.arrayContaining(["UNKNOWN_FEED_EVENT","POSSIBLE_DUPLICATE_EVENT","ORPHAN_FEED_EVENT"]));
 const ids=result.snapshot.practice_feed_event.filter(e=>e.movement_key==="receipt-384").map(e=>e.id);
 expect(result.report.differences.some(d=>d.sourceRefs.some(id=>ids.includes(id)))).toBe(true);
});
