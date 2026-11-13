import { RetentionRecordRepository } from "@jobguard/db";
import { registerRetentionReviewTasks } from "./retention-review-task.js";
import { registerExtraEscalationTasks } from "./extra-escalation-task.js";
import { escalateOverdueExtrasTask } from "@jobguard/db";
import { readinessTasks } from "./readiness-task.js";
import { executeEvidencePackV3 } from "./evidence-pack-v3.worker.js";
import { EvidencePackV3WorkerRepository } from "@jobguard/db";
import { readLateSourceObservations } from "@jobguard/db";
import { detectShadowObservations } from "@jobguard/core";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { FinalCheckCompletionRepository, FinalCheckRepository, ShadowDetectionRepository, ShadowObservationReader, FixtureObservationSources, decodePracticePhoto, practiceFinalCheckPorts } from "@jobguard/db";
import { FinalCheckError } from "@jobguard/core";
import { FinalCheckWorker } from "./final-check.worker.js";
import { generatePracticePng } from "./proof/proof.application.js";
import { ShadowFixtureProposer, shadowFixtureCorpusV1 } from "@jobguard/ai";
import { ShadowDetectionWorker } from "./shadow-detection.worker.js";
import { ActionExecutor, type OutboundAdapter, type SafeTelemetry, verifiedTenantContextForQueuedJob } from "@jobguard/db";
import { run, type TaskList } from "graphile-worker";
import { Pool } from "pg";
import { z } from "zod";
import { registerPracticeFinalCheckTasks, executePracticeFinalCheck, availabilitySafeFinalCheckPorts } from "./final-check-practice-run.js";
import { registerFinalCheckTask } from "./worker-task-extensions.js";
import { executeFinalCheckTask, type FinalCheckExecutionPorts } from "./final-check-task-executor.js";
import { requireOutboxSettlementEligibility } from "./production-settlement-guard.js";
import { RedactingLogger, redactingWorkerLogger, redactingTasks, redactedWorkerError } from "./safe-logging.js";

const logger = new RedactingLogger();
async function startWorker() {
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
// Queued identifiers enter business repositories only through this constructor.
function queueContext(payload:unknown){const parsed=z.object({tenantId:z.string().uuid()}).strict().parse(payload);return verifiedTenantContextForQueuedJob(parsed.tenantId);}
const fakeAdapter:OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,async deliver(action){return {kind:"succeeded",providerReference:`synthetic:${action.providerEffectKey}`};},async reconcile(){return "unknown";}};
const telemetry:SafeTelemetry={emit(name,fields){logger.log({event:name,...fields});}};
const executor=new ActionExecutor(runtimePool,new Map([[fakeAdapter.name,fakeAdapter]]),telemetry);
const tasks:TaskList={
 async discover_outbox(_payload,helpers){const rows=await helpers.withPgClient(client=>client.query<{action_id:string;tenant_id:string}>(`SELECT action_id,tenant_id FROM infrastructure.outbox_signal ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`));for(const row of rows.rows){await helpers.addJob("execute_outbox",{actionId:row.action_id,tenantId:row.tenant_id},{jobKey:`outbox:${row.action_id}`,jobKeyMode:"preserve_run_at"});}},
 // Gate money operations from the persisted action type; ordinary delivery keeps its existing behavior.
 async execute_outbox(payload){const parsed=z.object({actionId:z.guid({ error: "Invalid uuid" }),tenantId:z.guid({ error: "Invalid uuid" })}).strict().parse(payload);await executor.execute(queueContext({tenantId:parsed.tenantId}),parsed.actionId,actionType=>requireOutboxSettlementEligibility(process.env.JOBGUARD_ENV??"disabled",actionType));},
 async detect_shadow_evidence(payload){const parsed=z.object({version:z.literal("shadow-detection-task.v1"),tenantId:z.guid({ error: "Invalid uuid" }),jobId:z.guid({ error: "Invalid uuid" })}).strict().parse(payload);await detectionWorker.execute(queueContext({tenantId:parsed.tenantId}),parsed);},
};
// SV-5 practice run: the checked lock trigger or owner request queues identifiers; this worker alone
// freezes the manifest, examines each frozen source honestly, reconciles and publishes the completion record.
const finalCheckEnvironment=process.env.JOBGUARD_ENV??"disabled";
const practiceRun=new FinalCheckWorker(practiceFinalCheckPorts(shadowPool,runtimePool,createHash("sha256").update(generatePracticePng()).digest("hex"),createHash("sha256").update(generatePracticePng("j3-drainage-photo")).digest("hex")),finalCheckEnvironment);
const finalCheckRepository=new FinalCheckRepository(shadowPool);
const completionRepository=new FinalCheckCompletionRepository(shadowPool);
const finalCheckExecutionPorts:FinalCheckExecutionPorts={
 read:finalCheckRepository.manifest.bind(finalCheckRepository),
 execute:practiceRun.execute.bind(practiceRun),
 publish:completionRepository.publish.bind(completionRepository),
};
registerFinalCheckTask(tasks,async parsed=>{await executeFinalCheckTask(queueContext({tenantId:parsed.tenantId}),parsed,finalCheckExecutionPorts,finalCheckEnvironment);});
registerPracticeFinalCheckTasks(tasks,async parsed=>executePracticeFinalCheck(queueContext({tenantId:parsed.tenantId}),parsed,shadowPool,pinned=>{
 const repository=new FinalCheckRepository(pinned),completion=new FinalCheckCompletionRepository(pinned);
 const worker=new FinalCheckWorker(availabilitySafeFinalCheckPorts(practiceFinalCheckPorts(pinned,runtimePool,createHash("sha256").update(generatePracticePng()).digest("hex"),createHash("sha256").update(generatePracticePng("j3-drainage-photo")).digest("hex"))),finalCheckEnvironment);
 return {read:repository.manifest.bind(repository),execute:worker.execute.bind(worker),publish:completion.publish.bind(completion)};
},finalCheckEnvironment));
// Demo-only DEMO-J3 guide step: the practice builder asks, this worker holds signals from saved sources before lock.
const practicePhotoHash=(fixture:"completion-photo"|"j3-drainage-photo")=>createHash("sha256").update(generatePracticePng(fixture)).digest("hex");
const practiceHoldReader=new ShadowObservationReader(runtimePool,{async decode(source){return source.kind==="completion_photo"?decodePracticePhoto(source.sha256,practicePhotoHash("completion-photo"),practicePhotoHash("j3-drainage-photo")):null;}});
const demoHoldTaskV1=z.object({version:z.literal("demo-source-hold.v1"),requestId:z.guid({ error: "Invalid uuid" }),tenantId:z.guid({ error: "Invalid uuid" }),jobId:z.guid({ error: "Invalid uuid" })}).strict();
tasks.discover_demo_source_holds=async(_payload,helpers)=>{
 await helpers.withPgClient(async client=>{
  await client.query("BEGIN");
  try{
   const rows=await client.query<{id:string;tenant_id:string;job_id:string}>("SELECT id,tenant_id,job_id FROM infrastructure.demo_source_hold_request WHERE enqueued_at IS NULL ORDER BY requested_at LIMIT 100 FOR UPDATE SKIP LOCKED");
   for(const row of rows.rows){
    await client.query("SELECT graphile_worker.add_job('hold_demo_sources',$1::json,job_key := $2)",[JSON.stringify({version:"demo-source-hold.v1",requestId:row.id,tenantId:row.tenant_id,jobId:row.job_id}),`demo-source-hold:${row.id}`]);
    await client.query("UPDATE infrastructure.demo_source_hold_request SET enqueued_at=clock_timestamp() WHERE id=$1",[row.id]);
   }
   await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}
 });
};
tasks.hold_demo_sources=async(payload,helpers)=>{
 if(finalCheckEnvironment!=="synthetic_demo")throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
 const task=demoHoldTaskV1.parse(payload),context=queueContext({tenantId:task.tenantId});
 const late=await readLateSourceObservations(runtimePool,context,task.jobId);
 if(late.length){
  if(!await practiceHoldReader.hasAcceptedTerms(context))throw new Error("SHADOW_TERMS_NOT_ACCEPTED");
  await detectionRepository.persist(context,{version:"shadow-detection-batch.v1",jobId:task.jobId,observations:late,captures:[],
   proposals:detectShadowObservations(late,[],new Date().toISOString())});
 }else try{
  const {observations,captures}=await practiceHoldReader.read(context,{version:"shadow-observation-read.v1",jobId:task.jobId});
  await detectionRepository.persist(context,{version:"shadow-detection-batch.v1",jobId:task.jobId,observations,captures,proposals:detectShadowObservations(observations,captures,new Date().toISOString())});
 }catch(error){
  // Locked since the request: the Final Check run now examines the pre-lock sources itself.
  if((error as {code?:string}).code!=="DETECTION_LOCKED_JOB")throw error;
 }
 await helpers.withPgClient(client=>client.query("UPDATE infrastructure.demo_source_hold_request SET finished_at=clock_timestamp() WHERE id=$1",[task.requestId]));
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
const readiness = readinessTasks(runtimePool, finalCheckEnvironment, (store, scope) => {
 const context = queueContext({tenantId:scope.tenantId});
 return {load: raw => store.load(context, raw), loadJobPlans: raw => store.loadJobPlans(context, raw), recordProposal: raw => store.recordProposal(context, raw)};
});
Object.assign(tasks, readiness.tasks);
const extraEscalationCrontab=registerExtraEscalationTasks(tasks,finalCheckEnvironment,parsed=>
 escalateOverdueExtrasTask(runtimePool,queueContext({tenantId:parsed.tenantId})));
const extraEscalationTasks=extraEscalationCrontab?{discover_extra_escalations:tasks.discover_extra_escalations!,escalate_overdue_extras:tasks.escalate_overdue_extras!}:{};
const retentionRepository=new RetentionRecordRepository(runtimePool);
const retentionCrontab=registerRetentionReviewTasks(tasks,process.env.JOBGUARD_ENV??"disabled",async tenantId=>{
 const context=queueContext({tenantId});
 await retentionRepository.raiseTimerReviews(context,refusal=>console.warn("retention book refused",refusal));
});
const practiceOnly=process.env.JOBGUARD_WORKER_PRACTICE_FINAL_CHECK_ONLY==="1";
const runner=await run({connectionString:environment.GRAPHILE_DATABASE_URL,
 logger:redactingWorkerLogger(logger),
 taskList:redactingTasks(practiceOnly?{...extraEscalationTasks,...readiness.tasks,discover_final_check_requests:tasks.discover_final_check_requests!,final_check_practice_run:tasks.final_check_practice_run!,discover_evidence_pack_requests:tasks.discover_evidence_pack_requests!,build_evidence_pack_v3:tasks.build_evidence_pack_v3!,discover_demo_source_holds:tasks.discover_demo_source_holds!,hold_demo_sources:tasks.hold_demo_sources!}:tasks),
 crontab:[retentionCrontab && !practiceOnly ? retentionCrontab : "",practiceOnly?"*/1 * * * * discover_final_check_requests\n*/1 * * * * discover_evidence_pack_requests\n*/1 * * * * discover_demo_source_holds":"*/1 * * * * discover_outbox\n*/1 * * * * discover_final_check_requests\n*/1 * * * * discover_evidence_pack_requests\n*/1 * * * * discover_demo_source_holds",practiceOnly?readiness.crontab:"",extraEscalationCrontab].filter(Boolean).join("\n")});
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{
 void (async()=>{await runner.stop();await runtimePool.end();await shadowPool.end();})()
  .catch(()=>{logger.error("WORKER_TASK_FAILED");process.exitCode=1;});
});
}
try { await startWorker(); }
catch (error) { logger.error("WORKER_START_FAILED"); throw redactedWorkerError(error, "WORKER_START_FAILED"); }
