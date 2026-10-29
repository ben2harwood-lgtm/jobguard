import { executeEvidencePackV3 } from "./evidence-pack-v3.worker.js";
import { EvidencePackV3WorkerRepository } from "@jobguard/db";
import { detectShadowObservations } from "@jobguard/core";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { FinalCheckCompletionRepository, FinalCheckRepository, ShadowDetectionRepository, ShadowObservationReader, FixtureObservationSources, practiceFinalCheckPorts } from "@jobguard/db";
import { FinalCheckError } from "@jobguard/core";
import { FinalCheckWorker } from "./final-check.worker.js";
import { generatePracticePng } from "./proof/proof.application.js";
import { ShadowFixtureProposer, shadowFixtureCorpusV1 } from "@jobguard/ai";
import { ShadowDetectionWorker } from "./shadow-detection.worker.js";
import { ActionExecutor, type OutboundAdapter, type SafeTelemetry, verifiedTenantContextForQueuedJob } from "@jobguard/db";
import { run, type TaskList } from "graphile-worker";
import { Pool } from "pg";
import { z } from "zod";
import { registerFinalCheckTask } from "./worker-task-extensions.js";
import { executeFinalCheckTask } from "./final-check-task-executor.js";

const environmentSchema=z.object({GRAPHILE_DATABASE_URL:z.string().refine(value => URL.canParse(value), "Invalid url"),RUNTIME_DATABASE_URL:z.string().refine(value => URL.canParse(value), "Invalid url"),SHADOW_DATABASE_URL:z.string().refine(value => URL.canParse(value), "Invalid url")}).strict();
const environment=environmentSchema.parse({GRAPHILE_DATABASE_URL:process.env.GRAPHILE_DATABASE_URL,RUNTIME_DATABASE_URL:process.env.RUNTIME_DATABASE_URL,SHADOW_DATABASE_URL:process.env.SHADOW_DATABASE_URL});
const runtimePool=new Pool({connectionString:environment.RUNTIME_DATABASE_URL,application_name:"jobguard-business-worker"});
const shadowPool=new Pool({connectionString:environment.SHADOW_DATABASE_URL,application_name:"jobguard-shadow-worker"});
const posture=(await shadowPool.query<{safe:boolean}>(`SELECT NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolbypassrls
 AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=1
 AND EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid WHERE m.member=r.oid AND parent.rolname='jobguard_shadow' AND m.inherit_option)
 AS safe FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
if(posture?.safe!==true)throw new Error("SHADOW_POOL_ROLE_UNSAFE");
const corpus=shadowFixtureCorpusV1.parse(JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/shadow-observations.v1.json",import.meta.url),"utf8")));
const observationReader=new ShadowObservationReader(runtimePool,new FixtureObservationSources(corpus.cases.flatMap(c=>c.observations)));
const detectionRepository=new ShadowDetectionRepository(shadowPool);
const fixtureProposer=new ShadowFixtureProposer(Object.assign({},...corpus.cases.map(c=>c.responses)));
const detectionWorker=new ShadowDetectionWorker({assertTermsRelation:()=>observationReader.assertTermsRelation(),hasAcceptedTerms:context=>observationReader.hasAcceptedTerms(context),read:(context,request)=>observationReader.read(context,request),propose:(o,id,at)=>fixtureProposer.propose(o,id,at),persist:(context,request)=>detectionRepository.persist(context,request)},process.env.JOBGUARD_ENV??"disabled");
await detectionWorker.start();
// The single approved queued-job constructor is shared by the two strictly validated tasks.
function queueContext(payload:unknown){const parsed=z.object({tenantId:z.string().uuid()}).strict().parse(payload);return verifiedTenantContextForQueuedJob(parsed.tenantId);}
const fakeAdapter:OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,async deliver(action){return {kind:"succeeded",providerReference:`synthetic:${action.providerEffectKey}`};},async reconcile(){return "unknown";}};
const telemetry:SafeTelemetry={emit(name,fields){console.info(JSON.stringify({component:"outbox",name,...fields}));}};
const executor=new ActionExecutor(runtimePool,new Map([[fakeAdapter.name,fakeAdapter]]),telemetry);
const tasks:TaskList={
 async discover_outbox(_payload,helpers){const rows=await helpers.withPgClient(client=>client.query<{action_id:string;tenant_id:string}>(`SELECT action_id,tenant_id FROM infrastructure.outbox_signal ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`));for(const row of rows.rows){await helpers.addJob("execute_outbox",{actionId:row.action_id,tenantId:row.tenant_id},{jobKey:`outbox:${row.action_id}`,jobKeyMode:"preserve_run_at"});}},
 async execute_outbox(payload){const parsed=z.object({actionId:z.guid({ error: "Invalid uuid" }),tenantId:z.guid({ error: "Invalid uuid" })}).strict().parse(payload);await executor.execute(queueContext({tenantId:parsed.tenantId}),parsed.actionId);},
 async detect_shadow_evidence(payload){const parsed=z.object({version:z.literal("shadow-detection-task.v1"),tenantId:z.guid({ error: "Invalid uuid" }),jobId:z.guid({ error: "Invalid uuid" })}).strict().parse(payload);await detectionWorker.execute(queueContext({tenantId:parsed.tenantId}),parsed);},
};
registerFinalCheckTask(tasks,async parsed=>{await executeFinalCheckTask(queueContext({tenantId:parsed.tenantId}),parsed);});
// SV-5 Q6 practice run (Ben, 28 Oct). Requests come only from the owner's checked routine; this worker alone
// freezes the manifest, examines each frozen source honestly, reconciles and publishes the completion record.
const practiceRun=new FinalCheckWorker(practiceFinalCheckPorts(shadowPool,runtimePool,createHash("sha256").update(generatePracticePng()).digest("hex"),createHash("sha256").update(generatePracticePng("j3-drainage-photo")).digest("hex")),"synthetic_demo");
const practiceTaskV1=z.object({version:z.literal("final-check-practice-run.v1"),tenantId:z.guid({ error: "Invalid uuid" }),jobId:z.guid({ error: "Invalid uuid" }),lockId:z.guid({ error: "Invalid uuid" })}).strict();
tasks.discover_final_check_requests=async(_payload,helpers)=>{const rows=await helpers.withPgClient(client=>client.query<{lock_id:string;tenant_id:string;job_id:string}>(`SELECT lock_id,tenant_id,job_id FROM infrastructure.final_check_request WHERE enqueued_at IS NULL ORDER BY requested_at LIMIT 100 FOR UPDATE SKIP LOCKED`));for(const row of rows.rows){await helpers.addJob("final_check_practice_run",{version:"final-check-practice-run.v1",tenantId:row.tenant_id,jobId:row.job_id,lockId:row.lock_id},{jobKey:`final-check-practice:${row.lock_id}`});await helpers.withPgClient(client=>client.query("UPDATE infrastructure.final_check_request SET enqueued_at=clock_timestamp() WHERE lock_id=$1",[row.lock_id]));}};
tasks.final_check_practice_run=async payload=>{
 const task=practiceTaskV1.parse(payload),context=queueContext({tenantId:task.tenantId});
 const manifest=await new FinalCheckRepository(shadowPool).begin(context,task.jobId);
 if(manifest.lockId!==task.lockId)throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
 const result=await practiceRun.execute(context,{version:"final-check.task.v1",jobId:task.jobId,manifestId:manifest.id}) as {runId:string};
 // The invoice gate reads its own completion certificate; publish it once for this run.
 await new FinalCheckCompletionRepository(shadowPool).publish(context,{version:"final-check-publication.v1",jobId:task.jobId,runId:result.runId,checkId:randomUUID()}).catch((error:unknown)=>{if(!String((error as {code?:string})?.code??error).includes("IDEMPOTENCY"))throw error;});
};
// CH-8: queued identifiers only; hidden exports and must-surface persistence stay on this worker.
const packRepository = new EvidencePackV3WorkerRepository(shadowPool);
tasks.discover_evidence_pack_requests = async (_payload, helpers) => {
 const rows = await helpers.withPgClient(client => client.query<{tenant_id:string;command_id:string}>(
  "SELECT tenant_id,command_id FROM infrastructure.evidence_pack_v3_request WHERE completed_at IS NULL ORDER BY requested_at LIMIT 100"));
 for (const row of rows.rows) await helpers.addJob("build_evidence_pack_v3",
  {version:"evidence-pack-task.v3",tenantId:row.tenant_id,commandId:row.command_id},
  {jobKey:`evidence-pack-v3:${row.tenant_id}:${row.command_id}`,jobKeyMode:"preserve_run_at"});
};
tasks.build_evidence_pack_v3 = async payload => {
 const task = z.object({version:z.literal("evidence-pack-task.v3"),tenantId:z.string().uuid(),commandId:z.string().uuid()}).strict().parse(payload);
 const context = queueContext({tenantId:task.tenantId});
 await executeEvidencePackV3(context, task, packRepository, async jobId => {
  if (!await observationReader.hasAcceptedTerms(context)) throw new Error("SHADOW_TERMS_NOT_ACCEPTED");
  const {observations,captures} = await observationReader.read(context,{version:"shadow-observation-read.v1",jobId});
  await detectionRepository.persist(context,{version:"shadow-detection-batch.v1",jobId,observations,captures,
   proposals:detectShadowObservations(observations,captures,new Date().toISOString())});
 },process.env.JOBGUARD_ENV??"disabled");
};
// Browser-test isolation: the e2e worker runs only the practice final-check tasks, so queued outbox actions
// that existing journeys advance by hand are never delivered behind their backs.
const practiceOnly=process.env.JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY==="1";
const runner=await run({connectionString:environment.GRAPHILE_DATABASE_URL,
 taskList:practiceOnly?{discover_final_check_requests:tasks.discover_final_check_requests!,final_check_practice_run:tasks.final_check_practice_run!,discover_evidence_pack_requests:tasks.discover_evidence_pack_requests!,build_evidence_pack_v3:tasks.build_evidence_pack_v3!}:tasks,
 crontab:practiceOnly?"*/1 * * * * discover_final_check_requests\n*/1 * * * * discover_evidence_pack_requests":"*/1 * * * * discover_outbox\n*/1 * * * * discover_final_check_requests\n*/1 * * * * discover_evidence_pack_requests"});
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,async()=>{await runner.stop();await runtimePool.end();await shadowPool.end();});
