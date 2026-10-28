// CI: real PostgreSQL source projections; made-up rows only. Not quote sending or a live provider journey.
import { randomUUID,createHash } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { canonicalCommercialIntegritySnapshot } from "@jobguard/core";
import { actor,tenant,member,createIntegrityFixture,seedIntegrityJob,transaction,protectedFacts,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
let f:IntegrityFixture;
beforeAll(async()=>{f=await createIntegrityFixture();},120000);
afterAll(async()=>{await f?.close();});
const sha=(v:string)=>createHash("sha256").update(v).digest("hex");
async function review(job:string,kind:string){
 const view=await f.repo.read(f.auth.context,actor,f.auth.digest,job),finding=view.result.findings.find(x=>x.kind===kind);
 expect(finding,kind).toBeDefined();
 const body={version:"commercial-integrity-review.v3",commandId:randomUUID(),findingKey:finding!.key,findingSnapshotHash:sha(canonicalCommercialIntegritySnapshot(finding!.sourceSnapshot)),outcome:"dismissed_false_positive",explanation:"Fictional source projection check."};
 const first=await f.repo.review(f.auth.context,actor,f.auth.digest,job,body);
 expect(await f.repo.review(f.auth.context,actor,f.auth.digest,job,body)).toEqual(first);
 return {finding:finding!,body};
}
async function accepted(job:Awaited<ReturnType<typeof seedIntegrityJob>>,daysAgo:number,binding?:string){
 await transaction(f.admin,async db=>{
  const own=binding??(await db.query("SELECT id FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1",[tenant,job.job])).rows[0].id;
  // Isolated parent fixture setup only: a document's unrelated quote-revision parent is outside this projection test.
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
   VALUES($1,$2,$3,$4,1,'CH6 fixture',repeat('a',64),'synthetic/ch6','v1',1,'{}','{}',$5::jsonb)`,[job.quote,tenant,job.job,randomUUID(),JSON.stringify({netPence:199999,totalPence:239999,jobParties:{bindingId:own}})]);
  await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at,recorded_at)
   VALUES($1,$2,$3,$4,1,repeat('a',64),239999,'GBP','builder_attestation',$5,'Fictional customer','verbal',clock_timestamp()-($6||' days')::interval,clock_timestamp()-($6||' days')::interval)`,[randomUUID(),tenant,job.job,job.quote,member,daysAgo]);
  await db.query("UPDATE app.job SET accepted_quote_version_id=$1,status='accepted' WHERE tenant_id=$2 AND id=$3",[job.quote,tenant,job.job]);
  await db.query("SET LOCAL session_replication_role='origin'");
 });
}
it("CH-6 persisted won and related quote sources use exact document parties and do not write economic records",async()=>{
 const a=await seedIntegrityJob(f,false),b=await seedIntegrityJob(f,false);
 let binding:string;
 await transaction(f.admin,async db=>{
  const first=(await db.query("SELECT * FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1",[tenant,a.job])).rows[0];binding=randomUUID();
  await db.query(`INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
  VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,'entered')`,[tenant,binding,b.job,first.customer_id,first.customer_revision_id,first.paying_party_id,first.paying_party_revision_id,first.site_id,first.site_revision_id]);
 });
 await accepted(a,8);await accepted(b,7,binding!);
 const foreign=await seedIntegrityJob({...f,auth:f.other},false);let foreignBinding:string;
 await transaction(f.admin,async db=>{
  const first=(await db.query("SELECT * FROM app.job_party_binding WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1",[tenant,a.job])).rows[0];foreignBinding=randomUUID();
  await db.query(`INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,'entered')`,[tenant,foreignBinding,foreign.job,first.customer_id,first.customer_revision_id,first.paying_party_id,first.paying_party_revision_id,first.site_id,first.site_revision_id]);
 });
 await accepted(foreign,6,foreignBinding!);
 const before=await protectedFacts(f),view=await f.repo.read(f.auth.context,actor,f.auth.digest,a.job);
 expect(view.result.findings.map(x=>x.kind)).toEqual(expect.arrayContaining(["won_never_switched_live","related_sub2000_quotes_90_days"]));
 expect(view.result.findings.flatMap(f=>f.sourceReferences).some(s=>s.jobId===foreign.job)).toBe(false);
 expect(view.result.findings.filter(f=>f.kind==="related_sub2000_quotes_90_days")).toHaveLength(1);
 for(const kind of ["won_never_switched_live","related_sub2000_quotes_90_days"])await review(a.job,kind);
 expect(await protectedFacts(f)).toEqual(before);
 // Another session cannot obtain even a family, a cited related job, or an exact saved review replay.
 await expect(f.repo.read(f.auth.context,actor,f.other.digest,a.job)).rejects.toThrow("NOT_FOUND");
});
it("CH-6 immutable server lifecycle pairs survive read/review replays without inflating cycles",async()=>{
 const {job}=await seedIntegrityJob(f,false);
 await transaction(f.admin,async db=>{
  // Parent setup only; source reads and review verification execute with ordinary triggers and grants.
  await db.query("SET LOCAL session_replication_role='replica'");
  let predecessor:string|null=null;
  for(let n=1;n<=4;n++){
   const id=randomUUID(),finish=n%2===1;
   await db.query(`INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,command_id,predecessor_id,request_hash,audit_event_id)
   VALUES($1,$2,$3,$4,$5,clock_timestamp()-interval '1 hour'+($4||' seconds')::interval,$6,$7,$8,repeat('a',64),$9)`,[tenant,job,id,n,finish?"finished_on_site":"finished_cancelled",member,randomUUID(),finish?null:predecessor,randomUUID()]);
   predecessor=id;
  }
  await db.query("SET LOCAL session_replication_role='origin'");
 });
 const {finding}=await review(job,"repeated_finish_restart");expect(finding.sourceSnapshot.compared.cycles).toBe(2);
 expect((await f.repo.read(f.auth.context,actor,f.auth.digest,job)).result.findings.filter(x=>x.kind==="repeated_finish_restart")).toHaveLength(1);
});
it("CH-6 persisted user/phone/card assertions are opaque, immutable, session scoped and advisory",async()=>{
 const {job}=await seedIntegrityJob(f,false);
 for(const kind of ["user","phone","card"]){
  const id=randomUUID();
  const sql=`INSERT INTO app.ch6_identifier_assertion(tenant_id,job_id,id,session_digest,identifier_kind,subject_ref,authority_ref,sharing,valid_from,valid_until)
  VALUES($1,$2,$3,$4,$5,$6,$7,'unexplained',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day')`;
  const values=[tenant,job,id,f.auth.digest,kind,sha(`fictional-${kind}`),`synthetic_fixture:${kind}`];
  await transaction(f.admin,db=>db.query(sql,values));
  await expect(transaction(f.admin,db=>db.query(sql,values))).rejects.toMatchObject({code:"23505"});
  await expect(transaction(f.runtime,db=>db.query("SELECT * FROM app.ch6_identifier_assertion"))).rejects.toMatchObject({code:"42501"});
  await expect(transaction(f.runtime,db=>db.query(sql,[...values.slice(0,2),randomUUID(),...values.slice(3)]))).rejects.toMatchObject({code:"42501"});
  await expect(transaction(f.admin,db=>db.query("UPDATE app.ch6_identifier_assertion SET sharing='company' WHERE tenant_id=$1 AND id=$2",[tenant,id]))).rejects.toThrow();
 }
 const view=await f.repo.read(f.auth.context,actor,f.auth.digest,job);
 expect(view.result.findings.filter(x=>x.kind==="account_identifier_reuse")).toHaveLength(3);
 expect(view.availability).not.toContain("identifier_phone_source_unavailable");
 const projected=async(zone:string)=>transaction(f.runtime,async db=>{
  await db.query("SELECT set_config('TimeZone',$1,true)",[zone]);
  return (await db.query("SELECT app.ch6_integrity_sources($1,$2,$3) result",[tenant,job,f.auth.digest])).rows[0].result;
 });
 const utc=await projected("UTC"),local=await projected("Pacific/Auckland");
 expect({...local,input:{...local.input,evaluatedAt:utc.input.evaluatedAt}}).toEqual(utc);

 const before=await protectedFacts(f);await review(job,"account_identifier_reuse");expect(await protectedFacts(f)).toEqual(before);
 expect(JSON.stringify(view)).not.toMatch(/fictional-(phone|card)|identityUserId|membershipId/);
});
