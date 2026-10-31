// Owner-connected setup at predecessor schemas where LP-2's checked creator does not exist yet.
// Product create/advance/replay behavior remains covered at the current schema by lp-job-doors-compatibility.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch } from "../src/audit.js";
import { DEMO_TENANT_ID } from "../src/demo-seed.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const id = (value: string) => {
 const h = hash(value);
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};
export async function seedLegacySandbox(owner: Pool, session: string): Promise<string> {
 const tenant = DEMO_TENANT_ID, run = randomUUID(), job = randomUUID(), command = randomUUID();
 const digest = hash(session), payload = hash("create|core-1000|none");
 await withTenant(owner, testTenantContext(tenant), async db => {
  await db.$client.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario)
   VALUES($1,$2,'Synthetic practice job','quoting',$3,'core-1000')`, [job,tenant,digest]);
  await db.$client.query(`INSERT INTO app.sandbox_run(id,tenant_id,job_id,session_id,scenario,environment,status)
   VALUES($1,$2,$3,$4,'core-1000','synthetic_demo','active')`, [run,tenant,job,id(`practice-session:${digest}`)]);
  for (const [step,adapter,amount] of [[1,"fake_quote_review",100000],[2,"fake_job_progress",12500],[3,"fake_final_account",132000]] as const) {
   await db.$client.query(`INSERT INTO app.sandbox_work(id,tenant_id,run_id,step,adapter,input_hash,amount_pence,currency,environment,approved)
    VALUES($1,$2,$3,$4,$5,$6,$7,'GBP','synthetic_demo',true)`,
    [id(`${run}|work|${step}`),tenant,run,step,adapter,hash(`core-1000|${step}|${amount}|GBP`),amount]);
  }
  await db.$client.query(`INSERT INTO app.sandbox_run_event(id,tenant_id,run_id,event_index,kind,fake_clock_tick,command_id,payload_hash)
   VALUES($1,$2,$3,1,'created',0,$4,$5)`, [id(`${run}|event|${command}`),tenant,run,command,payload]);
  await appendAuditBatch(db,[{id:command,version:"audit.v1",actorRef:`synthetic-session:${digest}`,
   eventType:"sandbox.run.created",subjectType:"sandbox-run",subjectRef:run,
   payload:{references:{command},hashes:{payload},classifications:{sandbox:"operational"}}}]);
 });
 return run;
}
