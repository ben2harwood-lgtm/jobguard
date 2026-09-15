import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch } from "./audit.js";
import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "./demo-seed.js";
import { verifiedTenantContextFromMembership, withTenant } from "./tenant-context.js";

const actor = "synthetic-session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const deterministicId = (key: string) => { const h=hash(key); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
const context = () => verifiedTenantContextFromMembership({identityUserId:"d1500000-0000-4000-8000-000000000001",membershipId:DEMO_MEMBERSHIP_ID,tenantId:DEMO_TENANT_ID} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
export type SandboxRunView={id:string;jobId:string;scenario:"core-1000";status:"Synthetic practice"|"Archived";step:number;stepCount:3;fakeClockTick:number;realExternalActions:0;headline:string};
export class SandboxRepositoryError extends Error { constructor(readonly code:"NOT_FOUND"|"ARCHIVED"|"COMMAND_CONFLICT"|"FORBIDDEN") { super(code); } }

export class SandboxRepository {
 constructor(private readonly pool:Pool){}
 async create(sessionId:string,commandId:string){return this.seed(sessionId,commandId);}
 private async seed(sessionId:string,commandId:string,previousRunId?:string):Promise<SandboxRunView>{
  return withTenant(this.pool,context(),async db=>{
   const payloadHash=hash(`create|core-1000|${previousRunId??"none"}`);
   const replay=await db.$client.query<{subject_ref:string;payload_hash:string}>("SELECT subject_ref,payload_hash FROM app.audit_event WHERE tenant_id=$1 AND actor_ref=$2 AND id=$3",[DEMO_TENANT_ID,`${actor}:${sessionId}`,commandId]);
   if(replay.rowCount)return this.readIn(db.$client,sessionId,replay.rows[0]!.subject_ref);
   if(previousRunId){const old=await this.readIn(db.$client,sessionId,previousRunId);if(old.status==="Archived")return old;await this.event(db.$client,previousRunId,"archived",commandId,payloadHash,old.step+2);}
   const runId=randomUUID(),jobId=randomUUID();
   await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status,revision) VALUES($1,$2,'Practice kitchen','quoting',0)",[jobId,DEMO_TENANT_ID]);
   await db.$client.query("INSERT INTO app.sandbox_run(id,tenant_id,job_id,session_id,scenario,environment,status) VALUES($1,$2,$3,$4,'core-1000','synthetic_demo','active')",[runId,DEMO_TENANT_ID,jobId,sessionId]);
   for(const [i,adapter,amount] of [[1,"fake_quote_review",100000],[2,"fake_job_progress",12500],[3,"fake_final_account",132000]] as const){const input=hash(`core-1000|${i}|${amount}|GBP`);await db.$client.query("INSERT INTO app.sandbox_work(id,tenant_id,run_id,step,adapter,input_hash,amount_pence,currency,environment,approved) VALUES($1,$2,$3,$4,$5,$6,$7,'GBP','synthetic_demo',true)",[deterministicId(`${runId}|work|${i}`),DEMO_TENANT_ID,runId,i,adapter,input,amount]);}
   await this.event(db.$client,runId,"created",commandId,payloadHash,1);
   await appendAuditBatch(db,[{id:commandId,version:"audit.v1",actorRef:`${actor}:${sessionId}`,eventType:"sandbox.run.created",subjectType:"sandbox-run",subjectRef:runId,payload:{references:{command:commandId},hashes:{payload:payloadHash},classifications:{sandbox:"operational"}}}]);
   return this.readIn(db.$client,sessionId,runId);
  });
 }
 async reset(sessionId:string,runId:string,commandId:string){return this.seed(sessionId,commandId,runId);}
 async archive(sessionId:string,runId:string,commandId:string){return withTenant(this.pool,context(),async db=>{const current=await this.readIn(db.$client,sessionId,runId);if(current.status!=="Archived"){const payloadHash=hash(`archive|${runId}`);await this.event(db.$client,runId,"archived",commandId,payloadHash,current.step+2);await appendAuditBatch(db,[{id:commandId,version:"audit.v1",actorRef:`${actor}:${sessionId}`,eventType:"sandbox.run.archived",subjectType:"sandbox-run",subjectRef:runId,payload:{references:{command:commandId},hashes:{payload:payloadHash},classifications:{sandbox:"operational"}}}]);}return this.readIn(db.$client,sessionId,runId);});}
 async advance(sessionId:string,runId:string,commandId:string){return withTenant(this.pool,context(),async db=>{const current=await this.readIn(db.$client,sessionId,runId);if(current.status==="Archived")throw new SandboxRepositoryError("ARCHIVED");if(current.step>=3)return current;const step=current.step+1;const work=await db.$client.query<{id:string;adapter:string;input_hash:string}>("SELECT id,adapter,input_hash FROM app.sandbox_work WHERE tenant_id=$1 AND run_id=$2 AND step=$3 AND approved=true",[DEMO_TENANT_ID,runId,step]);if(!work.rowCount)throw new SandboxRepositoryError("NOT_FOUND");const w=work.rows[0]!,output=hash(`${w.adapter}|${w.input_hash}|tick:${step}`);await db.$client.query("INSERT INTO app.sandbox_adapter_receipt(id,tenant_id,run_id,work_id,attempt_number,adapter,input_hash,output_hash,fake_clock_tick,environment,external_action_count) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,'synthetic_demo',0) ON CONFLICT(tenant_id,work_id,attempt_number) DO NOTHING",[deterministicId(`${runId}|receipt|${step}`),DEMO_TENANT_ID,runId,w.id,w.adapter,w.input_hash,output,step]);const payloadHash=hash(`advance|${runId}|${step}`);await this.event(db.$client,runId,"advanced",commandId,payloadHash,step+1);await appendAuditBatch(db,[{id:commandId,version:"audit.v1",actorRef:`${actor}:${sessionId}`,eventType:"sandbox.run.advanced",subjectType:"sandbox-run",subjectRef:runId,payload:{references:{command:commandId},hashes:{payload:payloadHash},classifications:{sandbox:"operational"}}}]);return this.readIn(db.$client,sessionId,runId);});}
 async read(sessionId:string,runId:string){return withTenant(this.pool,context(),db=>this.readIn(db.$client,sessionId,runId));}
 private async event(client:Pool["query"] extends never?never:any,runId:string,kind:string,commandId:string,payloadHash:string,index:number){await client.query("INSERT INTO app.sandbox_run_event(id,tenant_id,run_id,event_index,kind,fake_clock_tick,command_id,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,command_id) DO NOTHING",[deterministicId(`${runId}|event|${commandId}`),DEMO_TENANT_ID,runId,index,kind,Math.max(0,index-1),commandId,payloadHash]);}
 private async readIn(client:{query:Pool["query"]},sessionId:string,runId:string):Promise<SandboxRunView>{const result=await client.query<{id:string;job_id:string;archived:boolean;step:number}>(`SELECT r.id,r.job_id,EXISTS(SELECT 1 FROM app.sandbox_run_event e WHERE e.tenant_id=r.tenant_id AND e.run_id=r.id AND e.kind='archived') archived,(SELECT count(*)::int FROM app.sandbox_adapter_receipt x WHERE x.tenant_id=r.tenant_id AND x.run_id=r.id) step FROM app.sandbox_run r WHERE r.tenant_id=$1 AND r.id=$2 AND r.session_id=$3`,[DEMO_TENANT_ID,runId,sessionId]);if(!result.rowCount)throw new SandboxRepositoryError("NOT_FOUND");const row=result.rows[0]!;const headlines=["Your fictional £1,000 quote is ready to review","The fictional job has started","A synthetic £125 extra is recorded","The fictional final account is £1,320.00"];return{id:row.id,jobId:row.job_id,scenario:"core-1000",status:row.archived?"Archived":"Synthetic practice",step:row.step,stepCount:3,fakeClockTick:row.step,realExternalActions:0,headline:headlines[row.step]!};}
}
