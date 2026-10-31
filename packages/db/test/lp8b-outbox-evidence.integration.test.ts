import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { EvidenceService } from "../src/evidence.js";
import { PreventionCheckRepository } from "../src/prevention-check-repository.js";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { ExtraRepository } from "../src/extra-repository.js";
import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";
import { jobDoorsActor, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { MemoryStorage, pngBytes } from "./site-extra-evidence-fixtures.js";
import { fixture, raise, type Cluster } from "./extra-fixtures.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";

let db:JobDoorsDatabase;
const savedMode=process.env.JOBGUARD_ENV;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";db=await jobDoorsDatabase(true);},300_000);
afterAll(async()=>{await db?.close();if(savedMode===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=savedMode;});
const digest=(v:string|Uint8Array)=>createHash("sha256").update(v).digest("hex");
async function session(actor?:{tenant:string;member:string;account:string;person:string}) {
  const a=actor??await jobDoorsActor(db.owner), credential=randomBytes(32).toString("hex");
  await db.owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[`${a.person}@fictional.invalid`,a.person]);
  await db.owner.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[a.person,a.tenant,a.member]);
  await db.owner.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')",[randomUUID(),a.person,credential]);
  return {...a,credential};
}
type Session=Awaited<ReturnType<typeof session>>;
async function request(s:Session,work:(c:PoolClient)=>Promise<void>){
  const c=await db.runtime.connect();
  try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[s.tenant]);await c.query("SELECT app.bind_request('real',$1,$2)",[s.credential,s.tenant]);await work(c);}
  finally{await c.query("ROLLBACK");c.release();}
}
async function refused(c:PoolClient,sql:string,params:unknown[]=[],code="42501"){
  await c.query("SAVEPOINT attack");
  try{await expect(c.query(sql,params)).rejects.toMatchObject({code});}
  finally{await c.query("ROLLBACK TO attack; RELEASE attack");}
}
// Test-only bridge for the explicitly dark LP-6a base. Production callers are
// cut over by LP-6b before this stacked piece lands; this is never exported.
function boundPool(s:Session):Pool{
  return new Proxy(db.runtime,{get(target,key){
    if(key!=="connect")return Reflect.get(target,key);
    return async()=>{
      const client=await target.connect();
      return new Proxy(client,{get(c,k){
        if(k!=="query"){const value=Reflect.get(c,k);return typeof value==="function"?value.bind(c):value;}
        return async(sql:string,params?:unknown[])=>{
          const result=await c.query(sql,params);
          if(sql==="BEGIN")await c.query("SELECT app.bind_request('real',$1,$2)",[s.credential,s.tenant]);
          return result;
        };
      }});
    };
  }}) as Pool;
}
async function authority(s:Session,revoked=false){
  const id=randomUUID(), d=randomUUID(), r=randomUUID(), content="Fictional approved artifact", hash=digest(content);
  await transaction(db.owner,s.tenant,async c=>{
    await c.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'quote.send')",[d,s.tenant,randomUUID()]);
    await c.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",[r,s.tenant,d,s.member]);
    await c.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at,revoked_at) VALUES($1,$2,$3,$4,$5,'quote.send','customer@fictional.invalid',$6,2,100,'GBP','synthetic.v1','2099-01-01',$7)",[id,s.tenant,d,r,s.member,hash,revoked?new Date():null]);
  });
  return [s.member,s.tenant,randomUUID(),id,"fake_capture",`fictional:${randomUUID()}`,"quote.send","customer@fictional.invalid",hash,content,2,100,"GBP","synthetic.v1",new Date("2099-01-01")];
}
const insert="SELECT app.insert_authorized_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)";
it("refuses direct inserts, every mismatched approved field, actor forgery, revocation and duplicate effects; checked work and signal are atomic",async()=>{
  const s=await session(), args=await authority(s);
  await request(s,async c=>{
    await refused(c,"INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,content_hash,immutable_content,aggregate_revision,policy_version,authorization_expires_at) VALUES($1,$2,$3,'fake_capture','forged','quote.send',$4,'substituted',2,'synthetic.v1','2099-01-01')",[randomUUID(),s.tenant,args[3],args[8]]);
    for(const [index,value] of [[0,randomUUID()],[1,randomUUID()],[6,"invoice.send"],[7,"other@fictional.invalid"],[8,"0".repeat(64)],[9,"substituted"],[10,3],[11,101],[12,"USD"],[13,"other.v1"],[14,new Date("2100-01-01")]] as const){const attack=[...args];attack[index]=value;await refused(c,insert,attack);}
    await c.query(insert,args);
    expect((await c.query("SELECT immutable_content,status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2",[s.tenant,args[2]])).rows).toEqual([{immutable_content:args[9],status:"pending"}]);
    await refused(c,insert,[...args.slice(0,2),randomUUID(),...args.slice(3)],"23505");
  });
  expect((await db.owner.query("SELECT 1 FROM infrastructure.outbox_signal WHERE action_id=$1",[args[2]])).rowCount).toBe(0);
  const revoked=await authority(s,true);
  await request(s,c=>refused(c,insert,revoked));
});

it("keeps finalized evidence scoped and exact, refuses fabricated verification and wrong references, and permits owner invalidation only",async()=>{
  const s=await session(), job=randomUUID(), bytes=pngBytes(41), context=verifiedTenantContextForQueuedJob(s.tenant);
  await importWatchdogFixtureJob(db.owner,s.tenant,job);
  const storage=new MemoryStorage(), service=new EvidenceService(boundPool(s),storage);
  const upload=await service.beginUpload(context,{jobId:job,expectedSha256:digest(bytes),contentType:"image/png",maximumBytes:1000,expiresAt:new Date("2099-01-01")});
  await request(s,async c=>{
    await refused(c,"UPDATE app.evidence_upload SET state='verified',server_verified_at=clock_timestamp(),object_version_id='v1' WHERE tenant_id=$1 AND id=$2",[s.tenant,upload.id]);
    await refused(c,"UPDATE app.evidence_upload SET expected_sha256=$3 WHERE tenant_id=$1 AND id=$2",[s.tenant,upload.id,"0".repeat(64)]);
    await c.query("UPDATE app.evidence_upload SET state='quarantined',object_version_id='v1' WHERE tenant_id=$1 AND id=$2",[s.tenant,upload.id]);
    // Correct bytes still do not prove that a storage read took place.
    await refused(c,"SELECT app.verify_evidence_upload($1,$2,'v1','image/png',$3)",[s.tenant,upload.id,Buffer.from(bytes)]);
  });
  storage.put(upload.objectKey,"v1",bytes);
  const evidence=await service.finalize(context,{uploadId:upload.id,objectVersionId:"v1",evidenceType:"site_photo"});
  expect(evidence).toMatchObject({object_key:upload.objectKey,object_version_id:"v1",sha256:digest(bytes),byte_length:String(bytes.length)});
  await request(s,async c=>{
    await refused(c,"UPDATE app.evidence_upload SET object_version_id='v2' WHERE tenant_id=$1 AND id=$2",[s.tenant,upload.id],"55000");
    for(const [tenant,targetJob,type] of [[randomUUID(),job,"site_photo"],[s.tenant,randomUUID(),"site_photo"],[s.tenant,job,"other_type"]])
      await refused(c,"INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,NULL,$5)",[randomUUID(),tenant,upload.id,targetJob,type]);
    await c.query("INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,NULL,'site_photo')",[randomUUID(),s.tenant,upload.id,job]);
  });
  const otherActor=await jobDoorsActor(db.owner,s.tenant as ReturnType<typeof randomUUID>);
  await db.owner.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2",[s.tenant,otherActor.member]);
  const other=await session(otherActor), invalidation="INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'wrong_subject')";
  await request(other,async c=>{
    await refused(c,invalidation,[randomUUID(),s.tenant,upload.id,other.member]);
    await refused(c,invalidation,[randomUUID(),s.tenant,upload.id,s.member]);
  });
  await request(s,async c=>{await c.query(invalidation,[randomUUID(),s.tenant,upload.id,s.member]);});
});

it("requires explicit prevention attribution from the bound owner and processing command; legitimate repository facts keep their actor",async()=>{
  const s=await session(), pool=boundPool(s), context=verifiedTenantContextForQueuedJob(s.tenant), job=randomUUID();
  await db.owner.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional prevention job','quoting')",[s.tenant,job]);
  const parties=new JobPartiesRepository(pool);
  const customer=await parties.command(context,s.member,job,{version:"job-parties-command.v1",commandId:randomUUID(),action:"create_customer",customer:{version:"customer.v1",name:"Fictional customer",type:"person"}});
  const site=await parties.command(context,s.member,job,{version:"job-parties-command.v1",commandId:randomUUID(),action:"create_site",site:{version:"site.v1",addressLines:["1 Fictional Lane"],town:"London",postcode:"SW1A 1AA"}});
  const binding=await parties.command(context,s.member,job,{version:"job-parties-command.v1",commandId:randomUUID(),action:"bind",expectedJobRevision:0,parties:{version:"job-parties.v1",customerRevisionId:customer.revisionId,siteRevisionId:site.revisionId}});
  const command=randomUUID();
  await new PreventionCheckRepository(pool).command(context,s.member,job,{version:"prevention-command.v1",commandId:command,action:"property",expectedBindingId:binding.id,scenarioNow:"2026-10-07T13:00:00.000Z",fixture:"mixed"});
  const fact=(await db.owner.query("SELECT * FROM app.property_constraint_fact WHERE tenant_id=$1 AND command_id=$2 LIMIT 1",[s.tenant,command])).rows[0];
  expect(fact.actor_membership_id).toBe(s.member);
  await request(s,async c=>{
    // Same valid source/result, but missing actor, forged actor or a completed receipt.
    for(const actor of [null,randomUUID(),s.member])await refused(c,`INSERT INTO app.property_constraint_fact(tenant_id,id,job_id,binding_id,site_revision_id,command_id,kind,source_id,source_name,retrieved_at,result,audit_event_id,actor_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[s.tenant,randomUUID(),job,fact.binding_id,fact.site_revision_id,command,fact.kind,fact.source_id,fact.source_name,fact.retrieved_at,fact.result,fact.audit_event_id,actor]);
  });
});

it("retains 0122 checks and requires the scoped grant for extra events",async()=>{
  const c={admin:db.owner,runtime:db.runtime} as Cluster, f=await fixture(c);
  const s=await session({tenant:f.p.tenantId,member:f.p.membershipId,person:f.p.identityUserId,account:(await db.owner.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId])).rows[0].account_id});
  const repository=new ExtraRepository(boundPool(s)), input=raise(f);
  await expect(repository.raiseExtra(f.ctx,input)).resolves.toHaveProperty("variationId");
  const row=(await db.owner.query("SELECT * FROM app.extra_event WHERE tenant_id=$1 LIMIT 1",[s.tenant])).rows[0];
  await request(s,c=>refused(c,"INSERT INTO app.extra_event(tenant_id,id,job_id,variation_id,kind,command_id,actor_membership_id) VALUES($1,$2,$3,$4,'awaiting_approval',$5,$6)",[s.tenant,randomUUID(),f.jobId,row.variation_id,input.commandId,s.member],"23514"));
  await db.owner.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,$2,$3)",[s.tenant,randomUUID(),f.grantId]);
  await expect(repository.raiseExtra(f.ctx,raise(f))).rejects.toBeTruthy();
});

it("keeps allocation tables SELECT-only and new security-definer entries private from PUBLIC/identity/infrastructure",async()=>{
  for(const table of ["receipt_line_allocation","recovery_case_allocation","recovery_case_allocation_reversal","recovery_allocation_command"]){
    const row=(await db.owner.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') readable,has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE') writable",[`app.${table}`])).rows[0];
    expect(row).toEqual({readable:true,writable:false});
  }
  const rows=(await db.owner.query("SELECT p.oid::regprocedure::text signature,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('insert_authorized_action','verify_evidence_upload')")).rows;
  expect(rows).toHaveLength(2);
  for(const r of rows){
    expect(r.proconfig).toContain("search_path=pg_catalog, pg_temp");
    for(const role of ["jobguard_identity","jobguard_infrastructure"])expect((await db.owner.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,r.signature])).rows[0].allowed).toBe(false);
  }
});
