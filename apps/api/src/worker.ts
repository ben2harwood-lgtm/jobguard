import { readFile } from "node:fs/promises";
import { ShadowDetectionRepository, ShadowObservationReader, FixtureObservationSources } from "@jobguard/db";
import { ShadowFixtureProposer, shadowFixtureCorpusV1 } from "@jobguard/ai";
import { ShadowDetectionWorker } from "./shadow-detection.worker.js";
import { ActionExecutor, type OutboundAdapter, type SafeTelemetry, verifiedTenantContextForQueuedJob } from "@jobguard/db";
import { run, type TaskList } from "graphile-worker";
import { Pool } from "pg";
import { z } from "zod";

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
const runner=await run({connectionString:environment.GRAPHILE_DATABASE_URL,taskList:tasks,crontab:"*/1 * * * * discover_outbox"});
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,async()=>{await runner.stop();await runtimePool.end();await shadowPool.end();});
