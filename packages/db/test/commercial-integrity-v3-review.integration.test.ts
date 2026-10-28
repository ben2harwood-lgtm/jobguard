import { beforeAll,afterAll,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { CommercialIntegrityV3Repository } from "../src/commercial-integrity-v3-repository.js";
import { actor,tenant,createIntegrityFixture,seedIntegrityJob,reviewFor,protectedFacts,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
let f:IntegrityFixture;beforeAll(async()=>{f=await createIntegrityFixture();},120000);afterAll(async()=>{await f?.close();});
it("CI-P04 concurrent duplicate commands persist one immutable receipt and one audit, across instances",async()=>{
 const {job}=await seedIntegrityJob(f),review=await reviewFor(f,job),before=await protectedFacts(f);
 const results=await Promise.all([f.repo.review(f.auth.context,actor,f.auth.digest,job,review),new CommercialIntegrityV3Repository(f.runtime).review(f.auth.context,actor,f.auth.digest,job,review)]);
 expect(results[0]).toEqual(results[1]);expect(await protectedFacts(f)).toEqual(before);
 const receipts=await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[tenant,review.commandId]);expect(receipts.rows[0].n).toBe(1);
 const audits=await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='commercial_integrity.reviewed.v3' AND payload->'references'->>'commandId'=$2",[tenant,review.commandId]);expect(audits.rows[0].n).toBe(1);
 await expect(f.repo.review(f.auth.context,actor,f.auth.digest,job,{...review,explanation:"Changed payload"})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 expect(await new CommercialIntegrityV3Repository(f.runtime).review(f.auth.context,actor,f.auth.digest,job,review)).toEqual(results[0]);
});
it("CI-P04 forged keys and snapshot hashes cannot save feedback",async()=>{
 const {job}=await seedIntegrityJob(f),review=await reviewFor(f,job);
 for(const changes of [{findingKey:"forged"},{findingSnapshotHash:"f".repeat(64)}])await expect(f.repo.review(f.auth.context,actor,f.auth.digest,job,{...review,...changes,commandId:randomUUID()})).rejects.toThrow("INTEGRITY_SOURCE_CHANGED");
});
it("CI-P10 later evaluation preserves hash; changed ordinary horizon refuses new review but original replays",async()=>{
 const {addIntegrityPayment}=await import("./commercial-integrity-v3-fixtures.js"),{job}=await seedIntegrityJob(f),review=await reviewFor(f,job);
 const later=await reviewFor(f,job);expect(later.findingSnapshotHash).toBe(review.findingSnapshotHash);expect(later.findingKey).toBe(review.findingKey);
 const first=await f.repo.review(f.auth.context,actor,f.auth.digest,job,review);await addIntegrityPayment(f,job);
 await expect(f.repo.review(f.auth.context,actor,f.auth.digest,job,{...review,commandId:randomUUID()})).rejects.toThrow("INTEGRITY_SOURCE_CHANGED");
 expect(await f.repo.review(f.auth.context,actor,f.auth.digest,job,review)).toEqual(first);
});
it("CI-P04 SQL independently refuses an invented source, omitted fact, changed policy or hash",async()=>{
 const {transaction}=await import("./commercial-integrity-v3-fixtures.js"),{job}=await seedIntegrityJob(f),review=await reviewFor(f,job),view=await f.repo.read(f.auth.context,actor,f.auth.digest,job),snapshot=view.result.findings[0]!.sourceSnapshot;
 for(const change of [{facts:[]},{facts:[{...snapshot.facts[0],source:{...snapshot.facts[0]!.source,sourceId:randomUUID()}}]},{profile:{...snapshot.profile,won:{delayMicroseconds:"1"}}},{scopeId:f.other.digest},{compared:{lockState:"present",activityKind:"invoice"}}]){
  await expect(transaction(f.runtime,db=>db.query("SELECT app.ch6_record_integrity_review($1,$2,$3,$4::jsonb,$5::jsonb)",[tenant,job,f.auth.digest,JSON.stringify({...review,commandId:randomUUID()}),JSON.stringify({...snapshot,...change})]))).rejects.toThrow("INTEGRITY_SOURCE_CHANGED");
 }
});
it("CI-P07 appended SQL audit hashes verify with the installed canonical audit verifier",async()=>{
 const {verifyAuditChain}=await import("../src/audit.js"),{job}=await seedIntegrityJob(f),review=await reviewFor(f,job);await f.repo.review(f.auth.context,actor,f.auth.digest,job,review);
 const rows=(await f.admin.query(`SELECT id,version,tenant_id AS "tenantId",sequence,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`,[tenant])).rows.map(r=>({...r,sequence:Number(r.sequence)}));
 expect(()=>verifyAuditChain(rows)).not.toThrow();
});
it("CI-P04 revocation while waiting for the membership row rolls back receipt and audit",async()=>{
 const {job}=await seedIntegrityJob(f),review=await reviewFor(f,job),blocker=await f.admin.connect();
 try{
  await blocker.query("BEGIN");await blocker.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[tenant,actor.membershipId]);
  const pending=f.repo.review(f.auth.context,actor,f.auth.digest,job,review).then(value=>({value}),error=>({error}));
  const deadline=Date.now()+10000;for(;;){
   const waiting=await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT app.ch6_record_integrity_review%' AND pid<>pg_backend_pid()");
   if(waiting.rowCount)break;if(Date.now()>deadline)throw new Error("Review did not reach membership contention");await new Promise(r=>setTimeout(r,10));
  }
  await blocker.query("COMMIT");const result=await pending;expect("error" in result).toBe(true);
  if("error" in result)expect(result.error.message).toBe("NOT_FOUND");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[tenant,review.commandId])).rows[0].n).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'commandId'=$2",[tenant,review.commandId])).rows[0].n).toBe(0);
 }finally{await blocker.query("ROLLBACK");blocker.release();await f.admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",[tenant,actor.membershipId]);}
});
it("CI-P08 SQL strict review schema refuses extra keys, UTF-16 overflow and untrimmed explanations",async()=>{
 const {transaction}=await import("./commercial-integrity-v3-fixtures.js"),{job}=await seedIntegrityJob(f),review=await reviewFor(f,job),snapshot=(await f.repo.read(f.auth.context,actor,f.auth.digest,job)).result.findings[0]!.sourceSnapshot;
 for(const change of [{tenantId:tenant},{outcome:"approved"},{version:"commercial-integrity-review.v1"},{explanation:"😀".repeat(251)},{explanation:"\u00a0hidden whitespace\u00a0"}])await expect(transaction(f.runtime,db=>db.query("SELECT app.ch6_record_integrity_review($1,$2,$3,$4::jsonb,$5::jsonb)",[tenant,job,f.auth.digest,JSON.stringify({...review,...change,commandId:randomUUID()}),JSON.stringify(snapshot)]))).rejects.toThrow("INVALID_INTEGRITY_REVIEW");
});

it("CH-6 cross-customer attack refuses another tenant's sources, feedback and exact receipt replay", async () => {
 const { verifiedTenantContextForQueuedJob, withTenant } = await import("../src/tenant-context.js");
 const {job} = await seedIntegrityJob(f), review = await reviewFor(f,job);
 await f.repo.review(f.auth.context,actor,f.auth.digest,job,review);
 const foreignTenant = randomUUID();
 await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)",[foreignTenant]);
 // A genuine server context alone cannot make the original practice identity a member of this tenant.
 const foreignContext = verifiedTenantContextForQueuedJob(foreignTenant);
 await expect(f.repo.read(foreignContext,actor,f.auth.digest,job)).rejects.toThrow("NOT_FOUND");
 await expect(f.repo.review(foreignContext,actor,f.auth.digest,job,review)).rejects.toThrow("NOT_FOUND");
 await expect(withTenant(f.runtime,foreignContext,db=>db.$client.query(
  "SELECT app.ch6_record_integrity_review($1,$2,$3,$4::jsonb,NULL::jsonb)",
  [foreignTenant,job,f.auth.digest,JSON.stringify(review)]))).rejects.toThrow("NOT_FOUND");
 const rows = await withTenant(f.runtime,foreignContext,db=>db.$client.query(
  "SELECT result FROM app.command_receipt WHERE command_id=$1",[review.commandId]));
 expect(rows.rows).toEqual([]);
});
