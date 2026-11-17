import { prepareInvoicePrerequisites } from "./sv5pre-fixtures.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { practiceFactsCatalogueV1, practiceMovementCatalogueV1, type PracticeFactsView, type PracticeFeedView } from "@jobguard/core";
import {
   issuePracticeSession, authenticatePracticeSession, appendAuditBatch, migrate, MIGRATION_URLS, practiceMaterialPool, PracticeFeedRepository, PracticeInvoiceRepository, withTenant,
} from "../src/index.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const priorEnvironment = process.env.JOBGUARD_ENV;
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const password = "synthetic-feed-test-only";
const context = testTenantContext(DEMO_TENANT_ID);
const actor = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
const previousJob = randomUUID(), otherTenant = randomUUID();
const command = (expectedRevision: number, extra: Record<string, unknown>) => ({ version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision, ...extra });
const advance = (expectedRevision: number, movement: string, step: string) => command(expectedRevision, { action: "advance", movement, step });
const repo = (environment = "synthetic_demo") => new PracticeFeedRepository(runtime, environment);
// SBOX's own derivation (practice-session.ts digestToken): the repository and the feed tables only ever see this, never the bearer token.
const digestOf = (token: string) => createHash("sha256").update(token).digest("hex");
const cmd = (r: PracticeFeedRepository, f: { sessionId: string; jobId: string }, raw: unknown) => r.command(context, actor, digestOf(f.sessionId), f.jobId, raw);
const view = (f: { sessionId: string; jobId: string }, query?: unknown) => repo().view(context, actor, digestOf(f.sessionId), f.jobId, query);
const count = async (sql: string, args: unknown[]) => Number((await admin.query(sql, args)).rows[0].n);

type Db = Parameters<Parameters<typeof withTenant>[2]>[0];
async function settings(db: Db, sessionId: string, environment = "synthetic_demo") {
  await db.$client.query("SELECT set_config('app.practice_feed_session_digest',$1,true),set_config('app.practice_feed_environment',$2,true)", [digestOf(sessionId), environment]);
}
async function fixture(existingSessionId?: string) {
  const sessionId = existingSessionId ?? await issuePracticeSession(runtime);
  const jobId = randomUUID(), auth = await authenticatePracticeSession(runtime, sessionId);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Generated practice job',$3,'capture')", [jobId, DEMO_TENANT_ID, auth.digest]);
  return { jobId, sessionId };
}
async function connected() {
  const f = await fixture(), state = await cmd(repo(), f, command(0, { action: "connect" }));
  return { ...f, state };
}
// A real issued practice invoice (£1,320.00) so that builder-attested receipts are recorded through the real routine.
async function invoice(jobId: string) {
  const invoices = new PracticeInvoiceRepository(practiceMaterialPool(runtime, (await admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, jobId])).rows[0].practice_session_digest)), quoteId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID();
  await admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,110000,'accepted')", [quoteId, DEMO_TENANT_ID, jobId, "b".repeat(64)]);
  // CH-2/CH-3a: take the job live through the real lifecycle routine, under the tenant context that the live-job and party guards read.
  const lifecycle = await admin.connect();
  try {
    await lifecycle.query("BEGIN"); await lifecycle.query("SELECT set_config('app.tenant_id',$1,true)", [DEMO_TENANT_ID]);
    await lifecycle.query("SELECT app.transition_job($1,$2,0,'quoting','start_quote')", [DEMO_TENANT_ID, jobId]);
    await lifecycle.query("SELECT app.transition_job($1,$2,1,'accepted','accept_quote',$3)", [DEMO_TENANT_ID, jobId, quoteId]);
    await lifecycle.query("SELECT app.transition_job($1,$2,2,'live','switch_live',$3,110000,'reference_fee_policy_v1',app.reference_recovery_cap(110000))", [DEMO_TENANT_ID, jobId, quoteId]);
    await lifecycle.query("COMMIT");
  } catch (error) { await lifecycle.query("ROLLBACK").catch(() => undefined); throw error; } finally { lifecycle.release(); }
  await admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, DEMO_TENANT_ID, jobId]);
  await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',110000,22000,132000,false,'[]')`, [revisionId, DEMO_TENANT_ID, jobId, draftId, "b".repeat(64), quoteId]);
  await admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, draftId, revisionId]);
  // Coordinator r4: scoped pool is used only to establish terms, lock and checked completion.
  const scopeItemId = randomUUID();
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeItemId, DEMO_TENANT_ID, jobId]);
  await admin.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',110000,1)", [randomUUID(), DEMO_TENANT_ID, jobId, revisionId, quoteId, scopeItemId]);
  const persistedDigest = (await admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, jobId])).rows[0].practice_session_digest;
  const setupPool = practiceMaterialPool(runtime, persistedDigest);
  await prepareInvoicePrerequisites(admin, setupPool, DEMO_TENANT_ID, jobId, DEMO_MEMBERSHIP_ID, revisionId);
  const issued = await invoices.issue(context, { jobId, finalAccountRevisionId: revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), recipient: "practice@example.invalid", issuedOn: "2026-09-19" });
  return { invoices, invoiceId: issued.id };
}
async function receipt(f: { jobId: string }, inv: Awaited<ReturnType<typeof invoice>>, amountPence: number) {
  return (await inv.invoices.recordReceipt(context, { jobId: f.jobId, invoiceId: inv.invoiceId, actorMembershipId: DEMO_MEMBERSHIP_ID, commandId: randomUUID(), paidOn: "2026-09-18", amountPence, method: "bank_transfer", reference: "Fictional receipt" })).paymentId;
}
// Tenant-wide row counts of every table a settled movement must never reach.
const moneyTables = async () => Object.fromEntries(await Promise.all(["landing_allocation", "landing_reversal", "recovery_fee_journal", "recovery_fee_derivation", "synthetic_recovery_receipt", "simulated_settlement_event", "journal", "journal_line"]
  .map(async (table) => [table, await count(`SELECT count(*) n FROM app.${table}`, [])] as const)));
const movement = (state: PracticeFeedView, key: string) => state.movements.find((m) => m.movementKey === key && m.underlyingMovementId === key)!;
const hashOf = (f: { jobId: string }, accountId: string, e: { kind: string; key: string; identity: string; representation: string; pence: number; state: string }) =>
  createHash("sha256").update(["practice-feed-event.v1", "synthetic_demo", DEMO_TENANT_ID, f.jobId, accountId, `${e.kind}-${e.key}`, e.kind, e.key, e.identity, e.representation, e.pence, "GBP", e.state].join("|")).digest("hex");

const factsCmd = (f: {sessionId:string;jobId:string}, revision:number, extra:Record<string,unknown>) => repo().factsCommand(context,actor,digestOf(f.sessionId),f.jobId,{version:"practice-facts-command.v1",commandId:randomUUID(),expectedRevision:revision,...extra});
const factsView = (f: {sessionId:string;jobId:string}) => repo().factsView(context,actor,digestOf(f.sessionId),f.jobId);
const fact = (v:PracticeFactsView,key:string) => v.movements.find(m=>m.movementKey===key&&m.underlyingMovementId===key)!;
const tables = ["practice_feed_job_owner","practice_feed_account","practice_feed_command","practice_feed_event","practice_feed_receipt_match"];
const rows = async () => (await admin.query(`SELECT tableoid::regclass::text t,row_to_json(r)::text v FROM app.practice_feed_command r UNION ALL SELECT tableoid::regclass::text,row_to_json(r)::text FROM app.practice_feed_event r UNION ALL SELECT tableoid::regclass::text,row_to_json(r)::text FROM app.practice_feed_receipt_match r ORDER BY 1,2`)).rows;
const catalogs = async () => ({
  tables:(await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) owner FROM pg_class c WHERE c.oid=ANY($1::regclass[]) ORDER BY c.relname",[tables.map(t=>`app.${t}`)])).rows,
  policies:(await admin.query("SELECT * FROM pg_policies WHERE schemaname='app' AND tablename=ANY($1) ORDER BY tablename,policyname",[tables])).rows,
  triggers:(await admin.query("SELECT tgrelid::regclass::text t,tgname,pg_get_triggerdef(oid) def FROM pg_trigger WHERE tgrelid=ANY($1::regclass[]) ORDER BY 1,2",[tables.map(t=>`app.${t}`)])).rows,
  functions:(await admin.query("SELECT proname,pg_get_functiondef(p.oid) def,proacl::text,prosecdef,pg_get_userbyid(proowner) owner,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime_exec FROM pg_proc p WHERE p.oid IN('app.guard_practice_feed()'::regprocedure,'app.require_practice_feed_effect()'::regprocedure) ORDER BY proname")).rows,
});
const catalogueChecks = async () => (await admin.query<{ table_name: string; conname: string; def: string; convalidated: boolean }>(
  "SELECT conrelid::regclass::text table_name,conname,pg_get_constraintdef(oid) def,convalidated FROM pg_constraint WHERE conrelid=ANY($1::regclass[]) AND contype='c' AND position('receipt-384' in pg_get_constraintdef(oid))>0 ORDER BY 1,2",
  [tables.slice(2).map(t => `app.${t}`)],
)).rows;
let upgradeChecks: Awaited<ReturnType<typeof catalogueChecks>>;
let upgradeRows:unknown, upgradeCatalogs:Awaited<ReturnType<typeof catalogs>>, upgraded:{jobId:string;sessionId:string}, mergedBefore:PracticeFeedView;
// Upgrade-proof reshape (coordinator rule 9): 0131 is applied ALONE and compared at full strength; every later migration then runs twice;
// afterwards the pre-existing rows are compared by the names of the columns that existed before 0131.
let alone:{rows:unknown;catalogs:Awaited<ReturnType<typeof catalogs>>;checks:Awaited<ReturnType<typeof catalogueChecks>>;perTable:{t:string;checks:{conname:string;def:string;convalidated:boolean}[]}[];view:PracticeFeedView};
let runBetween:{first:unknown;second:unknown};
let preColumns:Record<string,string[]>, preIds:Record<string,string[]>, namedBefore:Record<string,unknown[]>, typesBefore:{t:string;name:string;type:string}[];
const namedRows = async (db:Pick<Pool|PoolClient,"query">) => Object.fromEntries(await Promise.all(Object.keys(preColumns).map(async(t)=>[t,(await db.query(`SELECT row_to_json(t)::text AS bytes FROM (SELECT ${preColumns[t]!.map(c=>`"${c}"`).join(",")} FROM app.${t} WHERE id=ANY($1::uuid[])) t ORDER BY t.id`,[preIds[t]])).rows.map(r=>r.bytes as string)] as const))) as Record<string,string[]>;
// Name and full type (with modifiers) of each pre-0131 column, in a fixed order; columns added later are ignored.
const namedTypes = async (db:Pick<Pool|PoolClient,"query">) => (await db.query("SELECT c.relname t,a.attname name,format_type(a.atttypid,a.atttypmod) type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE a.attrelid=ANY($1::regclass[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname",[Object.keys(preColumns).map(t=>`app.${t}`)])).rows
  .filter(r=>preColumns[r.t as string]!.includes(r.name as string)).map(r=>({t:r.t as string,name:r.name as string,type:r.type as string}));
beforeAll(async()=>{
  process.env.JOBGUARD_ENV="synthetic_demo";
  directory=await mkdtemp(join(tmpdir(),"jobguard-practice-facts-"));
  const port=await freePort(60700,200);
  postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
  await postgres.initialise(); await postgres.start();
  admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password});
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const index=MIGRATION_URLS.findIndex(u=>fileURLToPath(u).endsWith("0131_practice_feed_facts.sql"));
  if(index<0)throw new Error("0131 missing");
  for(const url of MIGRATION_URLS.slice(0,index)){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[fileURLToPath(url).split("/").at(-1)]);}
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)",[DEMO_TENANT_ID,otherTenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Generated practice account')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
  await installLegacySyntheticPartyFixtures(admin);
  await admin.query("CREATE ROLE practice_feed_test_login LOGIN PASSWORD 'synthetic-feed-test-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO practice_feed_test_login");
  runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"practice_feed_test_login",password,max:4});
  upgraded=await connected(); let v=await view(upgraded);
  for(const entry of practiceMovementCatalogueV1)v=await cmd(repo(),upgraded,advance(v.revision,entry.movement,"settled"));
  const inv=await invoice(upgraded.jobId), paymentId=await receipt(upgraded,inv,38400);
  mergedBefore=await cmd(repo(),upgraded,command(v.revision,{action:"match_receipt",movement:"receipt-384",paymentId}));
  upgradeRows=await rows();upgradeCatalogs=await catalogs();upgradeChecks=await catalogueChecks();
  const columnRows=(await admin.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='app' AND table_name=ANY($1) ORDER BY table_name,ordinal_position",[tables.slice(2)])).rows;
  preColumns=Object.fromEntries(tables.slice(2).map(t=>[t,columnRows.filter(c=>c.table_name===t).map(c=>c.column_name as string)]));
  preIds=Object.fromEntries(await Promise.all(tables.slice(2).map(async t=>[t,(await admin.query(`SELECT id FROM app.${t} ORDER BY id`)).rows.map(r=>r.id as string)] as const)));
  namedBefore=await namedRows(admin);typesBefore=await namedTypes(admin);
  // Apply 0131 ALONE, the way the runner applies one file (run its SQL, then record it), and capture what it did.
  const alonePath=fileURLToPath(MIGRATION_URLS[index]!);
  await admin.query(await readFile(alonePath,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[alonePath.split("/").at(-1)]);
  alone={rows:await rows(),catalogs:await catalogs(),checks:await catalogueChecks(),perTable:await Promise.all(tables.slice(2).map(async t=>({t,checks:(await admin.query("SELECT conname,pg_get_constraintdef(oid) def,convalidated FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c' AND position('receipt-384' in pg_get_constraintdef(oid))>0",[`app.${t}`])).rows}))),view:await view(upgraded)};
  // Then every later migration, twice; the second run must change nothing.
  await migrate(admin);runBetween={first:await rows(),second:null};await migrate(admin);runBetween.second=await rows();
},90000);
afterAll(async()=>{if(priorEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=priorEnvironment;await closeTestPools(runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});});

describe("PRACTICE-FACTS-1 real PostgreSQL (written first; NOT RUN in builder sandbox)",()=>{
  it("populated upgrade preserves every old row byte-for-byte, checks all rows, and leaves all security and routine catalogs identical; remigrate no-op",async()=>{
    // 0131 applied alone: everything it did, at full strength.
    expect(alone.rows).toEqual(upgradeRows);expect(alone.catalogs).toEqual(upgradeCatalogs);
    expect(alone.view).toEqual(mergedBefore);
    for(const {checks} of alone.perTable){
      expect(checks).toHaveLength(2);expect(checks.every(c=>c.convalidated)).toBe(true);
    }
    const afterChecks = alone.checks;
    expect(upgradeChecks).toHaveLength(6);
    expect(afterChecks.map(c => [c.table_name, c.conname])).toEqual(upgradeChecks.map(c => [c.table_name, c.conname]));
    for (const previous of upgradeChecks) {
      const replacement = afterChecks.find(c => c.table_name === previous.table_name && c.conname === previous.conname)!;
      expect(replacement.convalidated).toBe(true);
      const oldValues = previous.def.match(/'[^']*'|\b\d+\b/gu) ?? [];
      const widenedValues = new Set(replacement.def.match(/'[^']*'|\b\d+\b/gu) ?? []);
      expect(oldValues.every(value => widenedValues.has(value))).toBe(true);
    }
    // After every later migration, run twice: 0131 recorded once and in order, the second run changed nothing.
    const applied=(await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name);
    expect(applied.filter(n=>n==="0131_practice_feed_facts.sql")).toHaveLength(1);
    expect(applied.indexOf("0119_recovery_eligibility_v3.sql")).toBeLessThan(applied.indexOf("0131_practice_feed_facts.sql"));
    expect(runBetween.second).toEqual(runBetween.first);
    // After ALL migrations: the pre-existing rows keep identical values in the columns that existed before 0131 (compared by name),
    // and the original allowed values are still allowed (tolerant: a later migration may add more).
    for(const t of Object.keys(preColumns))expect(namedBefore[t]!.length).toBeGreaterThan(0);
    expect(await namedRows(admin)).toEqual(namedBefore);
    expect(typesBefore).toHaveLength(Object.values(preColumns).flat().length);expect(await namedTypes(admin)).toEqual(typesBefore);
    const laterChecks = await catalogueChecks();
    for (const previous of upgradeChecks) {
      const now = laterChecks.find(c => c.table_name === previous.table_name && c.conname === previous.conname)!;
      const nowValues = new Set(now.def.match(/'[^']*'|\b\d+\b/gu) ?? []);
      expect((previous.def.match(/'[^']*'|\b\d+\b/gu) ?? []).every(value => nowValues.has(value))).toBe(true);
    }
    const before=await rows();await migrate(admin);expect(await rows()).toEqual(before);
  });
  it("upgrade-proof control: a changed value in a pre-existing column of a pre-existing row fails the named-column comparison (rolled back)",async()=>{
    const client=await admin.connect();
    try{
      await client.query("BEGIN");
      expect(await namedRows(client)).toEqual(namedBefore);
      const changed=await client.query("UPDATE app.practice_feed_event SET source_hash=repeat('0',64) WHERE id=(SELECT id FROM app.practice_feed_event WHERE id=ANY($1::uuid[]) ORDER BY id LIMIT 1)",[preIds.practice_feed_event]);
      expect(changed.rowCount).toBe(1);
      expect(await namedRows(client)).not.toEqual(namedBefore);
    }finally{await client.query("ROLLBACK");client.release();}
    expect(await namedRows(admin)).toEqual(namedBefore);
  });
  it("upgrade-proof control: an added nullable column or an added trigger on a pre-existing table leaves the named-column comparison green (rolled back)",async()=>{
    const beforeCatalogs=await catalogs();
    const client=await admin.connect();
    try{
      await client.query("BEGIN");
      await client.query("ALTER TABLE app.practice_feed_event ADD COLUMN scratch_note text");
      await client.query("CREATE FUNCTION app.scratch_noop_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$");
      await client.query("CREATE TRIGGER scratch_noop_trigger BEFORE INSERT ON app.practice_feed_event FOR EACH ROW EXECUTE FUNCTION app.scratch_noop_trigger()");
      expect((await client.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='app.practice_feed_event'::regclass AND tgname='scratch_noop_trigger'")).rows[0].n).toBe(1);
      expect((await client.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='app' AND table_name='practice_feed_event' AND column_name='scratch_note'")).rows[0].n).toBe(1);
      expect(await namedRows(client)).toEqual(namedBefore);
    }finally{await client.query("ROLLBACK");client.release();}
    expect(await catalogs()).toEqual(beforeCatalogs);
    expect(await namedRows(admin)).toEqual(namedBefore);
  });
  it("upgrade-proof control: a one-microsecond change to a pre-existing creation time fails the row comparison (rolled back)",async()=>{
    const client=await admin.connect();
    try{
      await client.query("BEGIN");
      expect(await namedRows(client)).toEqual(namedBefore);
      const changed=await client.query("UPDATE app.practice_feed_event SET created_at=created_at+interval '1 microsecond' WHERE id=(SELECT id FROM app.practice_feed_event WHERE id=ANY($1::uuid[]) ORDER BY id LIMIT 1)",[preIds.practice_feed_event]);
      expect(changed.rowCount).toBe(1);
      expect(await namedRows(client)).not.toEqual(namedBefore);
    }finally{await client.query("ROLLBACK");client.release();}
    expect(await namedRows(admin)).toEqual(namedBefore);
  });
  it("upgrade-proof control: a type change of a pre-existing column fails the type comparison (rolled back)",async()=>{
    const client=await admin.connect();
    try{
      await client.query("BEGIN");
      expect(await namedTypes(client)).toEqual(typesBefore);
      await client.query("ALTER TABLE app.practice_feed_event ALTER COLUMN source_hash TYPE text");
      expect(await namedTypes(client)).not.toEqual(typesBefore);
    }finally{await client.query("ROLLBACK");client.release();}
    expect(await namedTypes(admin)).toEqual(typesBefore);
  });
  it("mixed seven old and six new facts preserve the merged movements, receipts and event count; revision alone follows all commands",async()=>{
    for(const e of practiceFactsCatalogueV1){const v=await factsView(upgraded);await factsCmd(upgraded,v.revision,{action:"advance",movement:e.movement,step:"settled"});}
    const after=await view(upgraded);expect({...after,revision:mergedBefore.revision}).toEqual(mergedBefore);expect(after.movementCount).toBe(7);expect(after.eventCount).toBe(7);
    expect((await factsView(upgraded)).movementCount).toBe(6);
  });
  it("old-only job keeps all ordinary £120, £70 and £384 receipts in the merged view", async () => {
    const f = await fixture(), inv = await invoice(f.jobId);
    const amounts = [12000, 7000, 38400], ids = [];
    for (const amount of amounts) ids.push(await receipt(f, inv, amount));
    const merged = await view(f);
    expect(merged.receipts.map(r => r.paymentId).sort()).toEqual(ids.sort());
    expect(merged.receipts.map(r => r.amountPence).sort((a, b) => a - b)).toEqual([...amounts].sort((a, b) => a - b));
    expect(merged.receipts).toHaveLength(3);
  });
  it("old-only job keeps every new example amount at once with main's receipt count and total", async () => {
    const f = await connected(), inv = await invoice(f.jobId);
    const amounts = practiceFactsCatalogueV1.map(e => e.grossPence), ids = [];
    for (const amount of amounts) ids.push(await receipt(f, inv, amount));
    const merged = await view(f);
    // The merged reader on main includes every builder-attested payment, irrespective of its amount.
    expect(merged.receipts.map(r => r.paymentId).sort()).toEqual(ids.sort());
    expect(merged.receipts).toHaveLength(6);
    expect(merged.receipts.reduce((total, r) => total + BigInt(r.amountPence), 0n)).toBe(2827000n);
    expect(merged.movements).toEqual([]);expect(merged.eventCount).toBe(0);
  });
  it("ordinary £120 receipt stays merged beside the separate matched F18 £120 interest receipt", async () => {
    const f = await connected(), inv = await invoice(f.jobId);
    const ordinaryId = await receipt(f, inv, 12000), interestId = await receipt(f, inv, 12000);
    const interest = practiceFactsCatalogueV1.find(e => e.fixture === "F18-outside-vat" && e.grossPence === 12000)!;
    let facts = await factsCmd(f, 1, { action: "advance", movement: interest.movement, step: "settled" });
    facts = await factsCmd(f, facts.revision, { action: "match_receipt", movement: interest.movement, paymentId: interestId });
    const merged = await view(f);
    expect(merged.receipts.map(r => r.paymentId)).toEqual([ordinaryId]);
    expect(merged.receipts[0]?.amountPence).toBe(12000);
    expect(facts.receipts.find(r => r.paymentId === interestId)?.assessment).toMatchObject({ status: "qualifies", reason: "matched" });
    expect(merged.movements).toEqual([]);expect(merged.eventCount).toBe(0);
  });
  it("new facts and their matched receipts leave every merged total and count unchanged", async () => {
    const f = await connected(), inv = await invoice(f.jobId);
    const ordinaryIds = [await receipt(f, inv, 12000), await receipt(f, inv, 38400)];
    const before = await cmd(repo(), f, advance(1, "receipt-384", "settled"));
    for (const e of practiceFactsCatalogueV1) {
      let facts = await factsView(f);
      facts = await factsCmd(f, facts.revision, { action: "advance", movement: e.movement, step: "settled" });
      if (e.kind === "customer_receipt") {
        const paymentId = await receipt(f, inv, e.grossPence);
        await factsCmd(f, facts.revision, { action: "match_receipt", movement: e.movement, paymentId });
      }
    }
    const after = await view(f);
    expect(after.receipts.map(r => r.paymentId).sort()).toEqual(ordinaryIds.sort());
    expect(after.receipts).toHaveLength(2);
    expect(after.receipts.reduce((total, r) => total + BigInt(r.amountPence), 0n)).toBe(50400n);
    expect(after.movementCount).toBe(1);expect(after.eventCount).toBe(1);
    expect({ ...after, revision: before.revision }).toEqual(before);
  });
  it.each(practiceFactsCatalogueV1)("$movement goes pending → settled; replay, overlap, alternate representation and duplicates keep one identity and allocate zero",async e=>{
    const f=await connected(),before=await moneyTables(); let v=await factsCmd(f,1,{action:"advance",movement:e.movement,step:"pending"});
    expect(fact(v,e.movement)).toMatchObject({grossPence:e.grossPence,state:"pending",eligibleForAllocation:false});
    for(const step of ["settled","replay","page_overlap","alternate_representation"])v=await factsCmd(f,v.revision,{action:"advance",movement:e.movement,step});
    expect(v.movementCount).toBe(1);expect(v.eventCount).toBe(3);expect(fact(v,e.movement)).toMatchObject({grossPence:e.grossPence,state:"settled",eligibleForAllocation:true,allocatedEligibleNetPence:0});
    const sources=fact(v,e.movement).sourceHashes;expect(sources.every(s=>/^[a-f0-9]{64}$/u.test(s))).toBe(true);
    v=await factsCmd(f,v.revision,{action:"advance",movement:e.movement,step:"unknown_duplicate"});expect(v.movements.every(m=>!m.eligibleForAllocation)).toBe(true);
    v=await factsCmd(f,v.revision,{action:"reconcile_duplicate",movement:e.movement});expect(v.movementCount).toBe(1);expect(fact(v,e.movement).eligibleForAllocation).toBe(true);
    expect(await moneyTables()).toEqual(before);
  });
  it.each([1200000,1464000,12000,7000])("receipt %i matches only its exact settled unheld receipt fact and appears only in the new view",async pence=>{
    const f=await connected(),inv=await invoice(f.jobId),paymentId=await receipt(f,inv,pence),e=practiceFactsCatalogueV1.find(e=>e.grossPence===pence)!;
    await expect(factsCmd(f,1,{action:"match_receipt",movement:e.movement,paymentId})).rejects.toMatchObject({code:"PRACTICE_FEED_MOVEMENT_NOT_SETTLED"});
    let v=await factsCmd(f,1,{action:"advance",movement:e.movement,step:"pending"});
    await expect(factsCmd(f,v.revision,{action:"match_receipt",movement:e.movement,paymentId})).rejects.toMatchObject({code:"PRACTICE_FEED_MOVEMENT_NOT_SETTLED"});
    v=await factsCmd(f,v.revision,{action:"advance",movement:e.movement,step:"settled"});
    v=await factsCmd(f,v.revision,{action:"advance",movement:e.movement,step:"unknown_duplicate"});
    await expect(factsCmd(f,v.revision,{action:"match_receipt",movement:e.movement,paymentId})).rejects.toMatchObject({code:"PRACTICE_FEED_DUPLICATE_HELD"});
    v=await factsCmd(f,v.revision,{action:"reconcile_duplicate",movement:e.movement});v=await factsCmd(f,v.revision,{action:"match_receipt",movement:e.movement,paymentId});
    expect(v.receipts.find(r=>r.paymentId===paymentId)?.assessment).toMatchObject({status:"qualifies",reason:"matched"});expect((await view(f)).receipts).toEqual([]);
    const wrong=await receipt(f,inv,pence+1);await expect(factsCmd(f,v.revision,{action:"match_receipt",movement:e.movement,paymentId:wrong})).rejects.toMatchObject({code:"PRACTICE_FEED_RECEIPT_MISMATCH"});
  });
  it("supplier due is server fixed; two exact unheld payments are needed for paid-in-full",async()=>{
    const f=await connected();expect((await factsView(f)).laterInvoice.state).toBe("unpaid");
    let v=await factsCmd(f,1,{action:"advance",movement:"supplier-payment-600",step:"settled"});expect(v.laterInvoice).toMatchObject({settledPence:60000,state:"part_paid"});
    v=await factsCmd(f,v.revision,{action:"advance",movement:"supplier-payment-840",step:"pending"});expect(v.laterInvoice.state).toBe("part_paid");
    v=await factsCmd(f,v.revision,{action:"advance",movement:"supplier-payment-840",step:"settled"});expect(v.laterInvoice).toEqual({fixture:"later-supplier-invoice",cashDuePence:144000,settledPence:144000,state:"paid_in_full"});
  });
  it("replay is one effect, conflicting payload refuses; racing clients serialize with a stale revision",async()=>{
    const f=await connected(),input={version:"practice-facts-command.v1",commandId:randomUUID(),expectedRevision:1,action:"advance",movement:"receipt-12000",step:"settled"};
    const write=(raw:unknown)=>repo().factsCommand(context,actor,digestOf(f.sessionId),f.jobId,raw);
    const v=await write(input);expect(await write(input)).toEqual(v);await expect(write({...input,step:"pending"})).rejects.toMatchObject({code:"IDEMPOTENCY_PAYLOAD_CONFLICT"});
    const race=await Promise.allSettled([factsCmd(f,v.revision,{action:"advance",movement:"receipt-14640",step:"settled"}),factsCmd(f,v.revision,{action:"advance",movement:"supplier-payment-600",step:"settled"})]);
    expect(race.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(race.find(r=>r.status==="rejected")).toMatchObject({reason:{code:"PRACTICE_FEED_STALE_REVISION"}});
  });
  it("membership, stamped context, job ownership, missing context and server environment fail closed with zero new rows",async()=>{
    const f=await connected(),before=await rows(), stranger=await issuePracticeSession(runtime);
    const input={version:"practice-facts-command.v1",commandId:randomUUID(),expectedRevision:1,action:"advance",movement:"receipt-12000",step:"settled"};
    await expect(repo().factsCommand(context,actor,digestOf(stranger),f.jobId,input)).rejects.toMatchObject({code:"PRACTICE_FEED_NOT_FOUND"});
    await expect(repo().factsCommand(testTenantContext(otherTenant),actor,digestOf(f.sessionId),f.jobId,input)).rejects.toMatchObject({code:"PRACTICE_FEED_FORBIDDEN"});
    await expect(repo().factsCommand(context,{membershipId:randomUUID(),identityUserId:actor.identityUserId},digestOf(f.sessionId),f.jobId,input)).rejects.toMatchObject({code:"PRACTICE_FEED_FORBIDDEN"});
    for(const environment of ["pilot_no_charge","production_billing"])await expect(repo(environment).factsCommand(context,actor,digestOf(f.sessionId),f.jobId,input)).rejects.toMatchObject({code:"PRACTICE_FEED_FORBIDDEN"});
    await expect(runtime.query("INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,movement_key,step,actor_membership_id,payload_hash,environment) VALUES($1,$2,$3,$4,2,'advance','receipt-12000','settled',$5,$6,'synthetic_demo')",[randomUUID(),DEMO_TENANT_ID,f.jobId,f.state.accountId,DEMO_MEMBERSHIP_ID,"a".repeat(64)])).rejects.toMatchObject({code:"42501"});
    expect(await rows()).toEqual(before);
  });
  it("disconnect keeps history but refuses all three new command actions",async()=>{
    const f=await connected();let v=await factsCmd(f,1,{action:"advance",movement:"receipt-12000",step:"settled"});
    await cmd(repo(),f,command(v.revision,{action:"disconnect"}));v=await factsView(f);expect(v.movements).toHaveLength(1);
    for(const extra of [{action:"advance",movement:"receipt-14640",step:"settled"},{action:"reconcile_duplicate",movement:"receipt-12000"},{action:"match_receipt",movement:"receipt-12000",paymentId:randomUUID()}])await expect(factsCmd(f,v.revision,extra)).rejects.toMatchObject({code:"PRACTICE_FEED_DISCONNECTED"});
  });
  it("all merged RLS, owner, grants, routine execution restrictions and append-only protections remain enforced",async()=>{
    const c=await catalogs();expect(c.tables).toHaveLength(5);expect(c.tables.every(r=>r.relrowsecurity&&r.relforcerowsecurity&&r.owner==="jobguard_migration")).toBe(true);
    expect(c.functions.every(r=>!r.prosecdef&&!r.runtime_exec&&r.owner==="jobguard_migration")).toBe(true);
    const grants=(await admin.query("SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='jobguard_runtime' AND table_schema='app' AND table_name=ANY($1) ORDER BY 1,2",[tables])).rows;
    expect(grants).toEqual(tables.flatMap(t=>[{table_name:t,privilege_type:"INSERT"},{table_name:t,privilege_type:"SELECT"}]).sort((a,b)=>a.table_name.localeCompare(b.table_name)||a.privilege_type.localeCompare(b.privilege_type)));
    for(const t of tables)for(const sql of [`UPDATE app.${t} SET environment='synthetic_demo'`,`DELETE FROM app.${t}`,`TRUNCATE app.${t}`])await expect(withTenant(runtime,context,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});
  });
});

// Added during self-review: probe the merged database backstops with the new keys too.
async function rawCommand(f:{jobId:string;sessionId:string},accountId:string,revision:number,extra:{action?:string;key?:string;step?:string|null;paymentId?:string|null},effect:(db:Db,id:string)=>Promise<void>,environment="synthetic_demo") {
  return withTenant(runtime,context,async db=>{
    await settings(db,f.sessionId,environment);const id=randomUUID();
    await db.$client.query(`INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,movement_key,step,payment_id,actor_membership_id,payload_hash,environment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'synthetic_demo')`,
      [id,DEMO_TENANT_ID,f.jobId,accountId,revision,extra.action??"advance",extra.key??"receipt-12000",extra.step===undefined?"settled":extra.step,extra.paymentId??null,DEMO_MEMBERSHIP_ID,"a".repeat(64)]);
    await effect(db,id);
  });
}
async function rawEvent(db:Db,f:{jobId:string},accountId:string,commandId:string,key="receipt-12000",pence=1200000,hash?:string) {
  await db.$client.query(`INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash) VALUES($1,$2,$3,$4,$5,'settled',$6,$7,'identified','feed',$8,'GBP','settled','synthetic_demo','practice-feed-event.v1',$9)`,
    [randomUUID(),DEMO_TENANT_ID,f.jobId,accountId,commandId,key,`settled-${key}`,pence,hash??hashOf(f,accountId,{kind:"settled",key,identity:"identified",representation:"feed",pence,state:"settled"})]);
}
it("raw SQL refuses wrong amount, hash, missing command, supplier match, and a non-synthetic environment; each transaction leaves zero new rows",async()=>{
  const f=await connected(),account=f.state.accountId!,before=await rows();
  for(const e of practiceFactsCatalogueV1){
    await expect(rawCommand(f,account,2,{key:e.movement},(db,id)=>rawEvent(db,f,account,id,e.movement,e.grossPence+1))).rejects.toMatchObject({code:"23514"});
    await expect(rawCommand(f,account,2,{key:e.movement},(db,id)=>rawEvent(db,f,account,id,e.movement,e.grossPence,"f".repeat(64)))).rejects.toThrow("PRACTICE_FEED_EVENT_INVALID");
  }
  await expect(withTenant(runtime,context,async db=>{await settings(db,f.sessionId);await rawEvent(db,f,account,randomUUID());})).rejects.toMatchObject({code:"42501"});
  await expect(rawCommand(f,account,2,{},async()=>undefined,"pilot_no_charge")).rejects.toMatchObject({code:"42501"});
  const inv=await invoice(f.jobId),paymentId=await receipt(f,inv,60000);
  await expect(rawCommand(f,account,2,{action:"match_receipt",key:"supplier-payment-600",step:null,paymentId},async()=>undefined)).rejects.toMatchObject({code:"23514"});
  expect(await rows()).toEqual(before);
});
it("audited command completeness and audit-append failure both roll back all new-key effects",async()=>{
  const f=await connected(),account=f.state.accountId!,before=await rows();
  await expect(rawCommand(f,account,2,{},(db,id)=>rawEvent(db,f,account,id))).rejects.toThrow("PRACTICE_FEED_AUDIT_REQUIRED");
  expect(await rows()).toEqual(before);
  const auditBefore=(await admin.query("SELECT row_to_json(r)::text v FROM app.audit_event r WHERE tenant_id=$1 ORDER BY sequence",[DEMO_TENANT_ID])).rows;
  // Inject an actual SQL failure precisely at the audit append, inside the real transaction, without replacing the database.
  const failurePool=new Proxy(runtime,{get(target,key){
    if(key==="connect")return async()=>{const client=await target.connect();return new Proxy(client,{get(connection,property){
      if(property==="query")return (sql:string,values?:unknown[])=>sql.includes("INSERT INTO app.audit_event")?connection.query("SELECT 1/0"):connection.query(sql,values);
      const value=Reflect.get(connection,property);return typeof value==="function"?value.bind(connection):value;
    }});};
    const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }});
  // Fail the actual INSERT INTO app.audit_event; the owner has already been registered.
  await expect(new PracticeFeedRepository(failurePool,"synthetic_demo").factsCommand(context,actor,digestOf(f.sessionId),f.jobId,{version:"practice-facts-command.v1",commandId:randomUUID(),expectedRevision:1,action:"advance",movement:"receipt-12000",step:"settled"})).rejects.toMatchObject({code:"22012"});
  expect(await rows()).toEqual(before);expect((await admin.query("SELECT row_to_json(r)::text v FROM app.audit_event r WHERE tenant_id=$1 ORDER BY sequence",[DEMO_TENANT_ID])).rows).toEqual(auditBefore);
});
it("same-tenant wrong-job account, command and payment links fail composite foreign keys (23503)",async()=>{
  const f=await connected(),g=await connected();const inv=await invoice(g.jobId),paymentId=await receipt(g,inv,1200000);
  const probes=[
    {table:"practice_feed_command",trigger:"practice_feed_command_guard",sql:"INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,movement_key,step,actor_membership_id,payload_hash,environment) VALUES($1,$2,$3,$4,99,'advance','receipt-12000','settled',$5,$6,'synthetic_demo')",values:[randomUUID(),DEMO_TENANT_ID,f.jobId,g.state.accountId,DEMO_MEMBERSHIP_ID,"a".repeat(64)]},
    {table:"practice_feed_event",trigger:"practice_feed_event_guard",sql:"INSERT INTO app.practice_feed_event(id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash) VALUES($1,$2,$3,$4,$5,'settled','receipt-12000','settled-receipt-12000','identified','feed',1200000,'GBP','settled','synthetic_demo','practice-feed-event.v1',$6)",values:[randomUUID(),DEMO_TENANT_ID,f.jobId,f.state.accountId,g.state.accountId,"a".repeat(64)]},
    {table:"practice_feed_receipt_match",trigger:"practice_feed_receipt_match_guard",sql:"INSERT INTO app.practice_feed_receipt_match(id,tenant_id,job_id,account_id,command_id,payment_id,movement_key,settled_event_id,matched_pence,currency,environment) VALUES($1,$2,$3,$4,$5,$6,'receipt-12000','settled-receipt-12000',1200000,'GBP','synthetic_demo')",values:[randomUUID(),DEMO_TENANT_ID,f.jobId,f.state.accountId,f.state.accountId,paymentId]},
  ];
  const fCommand=(await admin.query("SELECT id FROM app.practice_feed_command WHERE job_id=$1",[f.jobId])).rows[0].id;
  const gCommand=(await admin.query("SELECT id FROM app.practice_feed_command WHERE job_id=$1",[g.jobId])).rows[0].id;
  probes[1]!.values[4]=gCommand;probes[2]!.values[4]=fCommand;
  // Bypass ONLY the named user guard to isolate the composite FK; PostgreSQL's FK triggers remain enabled.
  for(const p of probes){const client=await admin.connect();try{await client.query("BEGIN");await client.query(`ALTER TABLE app.${p.table} DISABLE TRIGGER ${p.trigger}`);await expect(client.query(p.sql,p.values)).rejects.toMatchObject({code:"23503"});}finally{await client.query("ROLLBACK");client.release();}}
});
it("F18 extra receipts settle after a real case opens, retaining original £3,000 and CH-7 result",async()=>{
  const f=await connected();const auth=await authenticatePracticeSession(runtime,f.sessionId);
  const {RecoveryCaseRepository,RecoveryEligibilityV3Repository,practiceMaterialPool}=await import("../src/index.js");
  const cases=new RecoveryCaseRepository(practiceMaterialPool(runtime,auth.digest));
  const c=await cases.command(context,f.jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:"withheld_customer_payment",claimedNetPence:300000,counterparty:"Fictional debtor",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"],expectedRevision:0},actor);
  let merged=await cmd(repo(),f,advance(1,"receipt-3000","settled"));
  let facts=await factsCmd(f,merged.revision,{action:"advance",movement:"receipt-interest-120",step:"settled"});facts=await factsCmd(f,facts.revision,{action:"advance",movement:"receipt-compensation-70",step:"settled"});
  const timing=(await admin.query("SELECT e.movement_key,e.gross_pence,e.created_at>c.created_at after_open FROM app.practice_feed_event e JOIN app.recovery_case c ON c.tenant_id=e.tenant_id AND c.job_id=e.job_id WHERE c.id=$1 AND e.event_kind='settled' ORDER BY movement_key",[c.id])).rows;
  const expectedMovements = ["receipt-3000", "receipt-compensation-70", "receipt-interest-120"];
  const expectedAmounts = ["300000", "7000", "12000"];
  expect(timing).toEqual(expectedMovements.map((movement, index) => ({ movement_key: movement, gross_pence: expectedAmounts[index], after_open: true })));
  const review=await new RecoveryEligibilityV3Repository(practiceMaterialPool(runtime,auth.digest),"synthetic_demo").review(context,f.jobId,{version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,expectedReviewRevision:0,fixture:"F18"},actor,auth.digest);
  expect(review.result).toMatchObject({qualifyingPrincipal:{pence:262000,currency:"GBP"},reason:"Fixed statutory compensation is not part of the fee base",productionEnabled:false});
});
it("fresh migration installs 0131 once without introducing business objects or changing grants",async()=>{
  const database=`practice_facts_fresh_${randomUUID().replaceAll("-","")}`;
  await admin.query(`CREATE DATABASE ${database}`);
  const fresh=new Pool({...admin.options,password,database});
  try{
    await migrate(fresh);await migrate(fresh);
    expect((await fresh.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name='0131_practice_feed_facts.sql'")).rows[0].n).toBe(1);
    const counts=(await fresh.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c WHERE c.oid=ANY($1::regclass[]) ORDER BY c.relname",[tables.map(t=>`app.${t}`)])).rows;
    expect(counts).toHaveLength(5);expect(counts.every(c=>c.relrowsecurity&&c.relforcerowsecurity&&c.owner==="jobguard_migration")).toBe(true);
  }finally{await fresh.end();await admin.query(`DROP DATABASE ${database}`);}
});
