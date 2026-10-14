import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { CommercialIntegrityApplication } from "../../../apps/api/src/commercial-integrity.application.js";
import { authenticatePracticeSession, issuePracticeSession, migrate, withTenant, verifyAuditChain,
  type AuditEvent, DEMO_TENANT_ID as T, DEMO_IDENTITY_USER_ID as U, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M,
  QuoteRepository, QuoteDeliveryRepository, QuoteAcceptanceRepository, PracticeActivationRepository } from "../src/index.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

const run = promisify(execFile), priorEnvironment = process.env.JOBGUARD_ENV;
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, port: number, tsconfig: string;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  dir = await mkdtemp(join(tmpdir(), "integrity-api-audit-")); port = await freePort(58300, 100);
  pg = new EmbeddedPostgres({ databaseDir: join(dir, "db"), port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start(); admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [T]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [U]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic audit builder')", [A,T]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [M,T,A,U]);
  await admin.query("CREATE ROLE integrity_audit_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO integrity_audit_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "integrity_audit_login", password: "synthetic", max: 4 });
  // A subprocess uses the same source module as Vitest, independent of dist build order.
  tsconfig = join(dir, "child-tsconfig.json");
  await writeFile(tsconfig, JSON.stringify({ compilerOptions: { paths: {
    "@jobguard/db": [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    "@jobguard/config": [fileURLToPath(new URL("../../config/src/index.ts", import.meta.url))],
  } } }));
}, 60000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true });
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
});

async function ownedActivation(legacy: boolean) {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session);
  const jobId = randomUUID(), scope = randomUUID(), revision = randomUUID(), draftId = randomUUID();
  // Owner credentials only establish this new synthetic fixture's immutable ownership.
  // Quote acceptance and activation below use the normal runtime commands.
  await withTenant(admin, auth.context, async db => {
    await db.$client.query("SET LOCAL ROLE jobguard_migration");
    await db.$client.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,saved_v1_sample)
      VALUES($1,$2,'Generated integrity audit fixture','quoting',$3,$4,$5)`, [jobId,T,auth.digest,legacy ? "v1_sample" : "capture",legacy]);
    await seedSyntheticPartyFixture(db.$client,T,jobId);
    await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope,T,jobId]);
    await db.$client.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
      VALUES($1,$2,$3,$4,1,'Generated fictional work','1','item',200000,200000)`, [revision,T,jobId,scope]);
  });
  await new QuoteRepository(runtime).saveDraft(auth.context, { jobId,draftId,expectedRevision:0,currency:"GBP",
    taxPolicyVersion:"candidate_m1_standard_v1",blockingQuestions:[],effectiveAt:new Date(),lines:[{
      id:randomUUID(),scopeItemId:scope,scopeRevisionId:revision,description:"Generated fictional work",origin:"captured",
      included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:200000,discountPercent:"0",
      taxTreatment:"standard_rate_20",rateProvenance:"entered",category:"Work",region:null,
    }] });
  const delivery = new QuoteDeliveryRepository(runtime), preview = await delivery.preview(auth.context,jobId,"audit-customer@example.invalid");
  await delivery.issue(auth.context,jobId,{commandId:randomUUID(),documentId:preview.documentId,contentHash:preview.hash,recipient:"audit-customer@example.invalid"});
  await delivery.execute(auth.context,jobId,preview.documentId,"success");
  await new QuoteAcceptanceRepository(runtime).accept(auth.context,jobId,{commandId:randomUUID(),documentId:preview.documentId,
    documentHash:preview.hash,documentVersion:preview.document.documentVersion,statedCustomerName:"Fictional customer",
    statedMethod:"email",acceptedAt:new Date().toISOString()});
  await new PracticeActivationRepository(runtime).start(auth.context,jobId,{commandId:randomUUID(),scenario:"no_charge"});
  const finalSource = randomUUID();
  await withTenant(runtime,auth.context,db=>db.$client.query(`INSERT INTO app.commercial_integrity_value_fact
    (id,tenant_id,job_id,value_kind,net_value_pence,currency,source_ref,occurred_at,synthetic)
    VALUES($1,$2,$3,'final',300000,'GBP',$4,clock_timestamp(),true)`,[randomUUID(),T,jobId,finalSource]));
  return {session,auth,jobId,documentId:preview.documentId,finalSource};
}
async function inProcess(session: string, jobId: string, input?: unknown) {
  const script = `import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(new URL("../../../apps/api/package.json",import.meta.url).href)});
    const { Pool } = require('pg');
    const { CommercialIntegrityApplication } = await import(${JSON.stringify(new URL("../../../apps/api/src/commercial-integrity.application.ts",import.meta.url).href)});
    const pool = new Pool({host:'127.0.0.1',port:${port},database:'postgres',user:'integrity_audit_login',password:'synthetic'});
    try { const app = new CommercialIntegrityApplication(pool,process.argv[1],'synthetic_demo');
      const input = JSON.parse(process.argv[3]);
      console.log(JSON.stringify(input === null ? await app.view(process.argv[2]) : await app.review(process.argv[2],input)));
    } finally { await pool.end(); }`;
  const result = await run(process.execPath, ["--import", fileURLToPath(new URL("../../../apps/api/node_modules/tsx/dist/loader.mjs",import.meta.url)),
    "--input-type=module","-e",script,session,jobId,JSON.stringify(input??null)], {
    env:{...process.env,JOBGUARD_ENV:"synthetic_demo",TSX_TSCONFIG_PATH:tsconfig},timeout:30000,
  });
  return JSON.parse(result.stdout);
}
const protectedState = async () => Promise.all(["job","cap_snapshot","job_activation_terms","journal","journal_line",
  "financial_authorization","action_authorization","decision","decision_resolution","recovery_fee_journal","action_outbox"]
  .map(async table => ({table,rows:(await admin.query(`SELECT to_jsonb(t) value FROM app.${table} t ORDER BY to_jsonb(t)::text`)).rows})));

it("retains integrity reviews across application processes",async()=>{
  const x = await ownedActivation(true), before = await protectedState();
  const input={version:"commercial-integrity-review.v1",commandId:randomUUID(),findingKey:"accepted_value_variance:1",
    explanation:"Generated acceptance needs review",outcome:"dismissed_false_positive"};
  const first=await inProcess(x.session,x.jobId,input),second=await inProcess(x.session,x.jobId);
  expect(second.feedback).toEqual(first.feedback);
  expect(second.feedback).toEqual([expect.objectContaining(input)]);
  expect(second.findings.find((row:{key:string})=>row.key===input.findingKey).dismissed).toBe(true);
  expect((await inProcess(x.session,x.jobId,input)).feedback).toEqual(second.feedback);
  const app=new CommercialIntegrityApplication(runtime,x.session,"synthetic_demo");
  await Promise.all([app.review(x.jobId,input),app.review(x.jobId,input)]);
  expect((await app.view(x.jobId)).feedback).toHaveLength(1);
  expect((await admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[T,input.commandId])).rows[0].n).toBe(1);
  const events=(await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='commercial_integrity.reviewed' AND subject_ref=$2",[T,x.jobId])).rows;
  expect(events).toHaveLength(1);expect(JSON.stringify(events)).not.toContain(input.explanation);
  expect(await protectedState()).toEqual(before);
  await withTenant(runtime,x.auth.context,async db=>{
    const chain=(await db.$client.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,
      actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",
      occurred_at AS "occurredAt",payload,trim(payload_hash) AS "payloadHash",trim(previous_hash) AS "previousHash",
      trim(event_hash) AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`,[T])).rows;
    expect(()=>verifyAuditChain(chain as AuditEvent[])).not.toThrow();
  });
},60000);
it("projects saved integrity money and omits nonexistent caps",async()=>{
  const x=await ownedActivation(true),y=await ownedActivation(false);
  const v1=await new CommercialIntegrityApplication(runtime,x.session,"synthetic_demo").view(x.jobId);
  expect(v1.capBasisPence).toBe(200000);expect(v1.acceptedCapPence).toBe(3000);
  expect(v1.findings.find(row=>row.kind==="accepted_value_variance")).toMatchObject({
    citedNumbers:{acceptedNetPence:200000,quotedNetPence:200000,finalNetPence:300000,differencePence:100000},
    sourceReferences:[`accepted:${x.documentId}`,`quote:${x.documentId}`,`final-account:${x.finalSource}`],
  });
  const v3=await new CommercialIntegrityApplication(runtime,y.session,"synthetic_demo").view(y.jobId);
  expect(v3.capBasisPence).toBe(200000);expect(v3.acceptedCapPence).toBeNull();
  const stranger=new CommercialIntegrityApplication(runtime,y.session,"synthetic_demo");
  await expect(stranger.view(x.jobId)).rejects.toThrow("NOT_FOUND");
  await expect(stranger.review(x.jobId,{version:"commercial-integrity-review.v1",commandId:randomUUID(),
    findingKey:"accepted_value_variance:1",explanation:"Not owned",outcome:"dismissed_false_positive"})).rejects.toThrow("NOT_FOUND");
  await expect(new CommercialIntegrityApplication(runtime,undefined,"synthetic_demo").view(x.jobId)).rejects.toThrow("UNAUTHENTICATED");
},60000);
