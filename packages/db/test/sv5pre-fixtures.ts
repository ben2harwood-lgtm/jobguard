import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { candidateM1TaxPolicy, money, addMoney } from "@jobguard/core";
import { migrate } from "../src/migrate.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

export const LOCK_OWNER = "40000000-0000-4000-8000-000000000004";
export const LOCK_USER = "30000000-0000-4000-8000-000000000003";
export const LOCK_HASH = "a".repeat(64);
export type LockFixture = { postgres: EmbeddedPostgres; directory: string; port: number; credential: string; admin: Pool; runtime: Pool; shadow: Pool; owner: Pool };
export async function createLockFixture(install = true): Promise<LockFixture> {
 const directory = await mkdtemp(join(tmpdir(), "sv5pre-pg16-")), port = await freePort(58400, 250), credential = randomUUID();
 const connection = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "postgres", password: credential };
 const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo"); const admin = new Pool(connection);
 if (install) { await migrate(admin); await installLegacySyntheticPartyFixtures(admin); }
 const pools: Pool[] = [];
 for (const role of ["jobguard_runtime", "jobguard_shadow", "jobguard_migration"]) {
  const login = `sv5pre_${randomUUID().replaceAll("-", "")}`;
  if (install) await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT ${role} TO ${login}`);
  pools.push(new Pool({ ...connection, user: install ? login : "postgres", max: 4 }));
 }
 return { postgres, directory, port, credential, admin, runtime: pools[0]!, shadow: pools[1]!, owner: pools[2]! };
}
export async function closeLockFixture(f: LockFixture) { await closeTestPools(f.runtime, f.shadow, f.owner, f.admin); await f.postgres.stop();  }
export async function asFixtureTenant<T>(pool: Pool, tenantId: string, work: (db: PoolClient) => Promise<T>): Promise<T> {
 const db = await pool.connect();
 try { await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]); const result = await work(db); await db.query("COMMIT"); return result; }
 catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
export async function seedAccount(admin: Pool, tenantId = randomUUID(), net = 3360000) {
 const tax=candidateM1TaxPolicy.calculateGroup(money(net),"standard_rate_20"),gross=addMoney(money(net),tax);
 const jobId = randomUUID(), scopeItemId = randomUUID(), baselineId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID(), lineId = randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenantId]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [LOCK_USER]);
 const account = randomUUID();
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SV-4')", [account, tenantId]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [LOCK_OWNER, tenantId, account, LOCK_USER]);
 await asFixtureTenant(admin, tenantId, async db => {
  await db.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional final account','live')", [jobId, tenantId]);
  await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeItemId, tenantId, jobId]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')", [baselineId, tenantId, jobId, LOCK_HASH, net]);
  await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, tenantId, jobId]);
  await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`, [revisionId, tenantId, jobId, draftId, LOCK_HASH, baselineId, net, tax.pence, gross.pence]);
  await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
   VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',$7,1)`, [lineId, tenantId, jobId, revisionId, baselineId, scopeItemId, net]);
  await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [revisionId, tenantId, draftId]);
 });
 return { tenantId, jobId, scopeItemId, baselineId, draftId, revisionId, lineId, context: testTenantContext(tenantId), input: { jobId, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), finalAccountRevisionId: revisionId, expectedRevision: 1, declarationVersion: "final_account_declaration.v1" as const } };
}
export async function prepareLock(f: LockFixture, a: Awaited<ReturnType<typeof seedAccount>>) {
 const repo = new FinalAccountLockRepository(f.runtime);
 await repo.acceptTerms(a.context, { actorMembershipId: LOCK_OWNER, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
 await repo.disposition(a.context, { jobId: a.jobId, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), scopeItemId: a.scopeItemId, disposition: "done" });
 return repo;
}

/** Tests only: inventories real fixture sources, persists explicitly simulated worker results,
 * and publishes through the same private checked triggers as the later SV-5 worker. */
export async function publishFixtureCompletion(shadow: Pool, admin: Pool, tenantId: string, jobId: string, overrides: { lockId?: string; cutoff?: string; checkId?: string; deterministicIds?: boolean } = {}) {
 const lock=(await admin.query("SELECT id,locked_at::text cutoff FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[tenantId,jobId])).rows[0];
 // Separate namespaces: source/lock-derived public ids never consume a per-signal counter.
 const fixtureId=(namespace: "source"|"signal",label: string)=>{
  if(!overrides.deterministicIds) return randomUUID();
  const hex=createHash("sha256").update(`sv5pre-fixture.v1:${namespace}:${tenantId}:${jobId}:${lock.id}:${label}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
 };
 const manifestId=fixtureId("source","manifest"),runId=fixtureId("source","run"),executionId=fixtureId("source","execution"),checkId=overrides.checkId??fixtureId("source","check");
 await asFixtureTenant(shadow,tenantId,async db=>{
  await db.query("INSERT INTO app.final_check_manifest(tenant_id,job_id,id,lock_id,evidence_cutoff_at,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5,'synthetic-fixture.v1','synthetic-fixture.v1')",[tenantId,jobId,manifestId,overrides.lockId??lock.id,overrides.cutoff??lock.cutoff]);
 });
 // The committed frozen inventory is now visible to the independent fixture reader.
 return asFixtureTenant(shadow,tenantId,async db=>{
  const sources=(await admin.query("SELECT s.*,e.id finalized_id,e.object_version_id finalized_version,e.sha256 finalized_hash,e.server_received_at::text finalized_received FROM app.final_check_manifest_source s LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id)=(s.tenant_id,s.job_id,s.upload_id) AND e.kind='original' WHERE s.tenant_id=$1 AND s.job_id=$2 AND s.manifest_id=$3 AND s.excluded_state IS NULL ORDER BY s.id",[tenantId,jobId,manifestId])).rows;
  await db.query("INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at,status) VALUES($1,$2,$3,'synthetic-fixture.v1',$4,'completed')",[tenantId,jobId,runId,lock.cutoff]);
  const signals=(await db.query("SELECT DISTINCT s.id FROM app.shadow_commercial_signal s JOIN app.shadow_signal_evidence e ON(e.tenant_id,e.job_id,e.signal_id)=(s.tenant_id,s.job_id,s.id) WHERE s.tenant_id=$1 AND s.job_id=$2 AND e.source_received_at<=$3::timestamptz ORDER BY s.id",[tenantId,jobId,lock.cutoff])).rows;
  for(const source of sources) {
   const signalIds=(await db.query("SELECT DISTINCT signal_id FROM app.shadow_signal_evidence WHERE tenant_id=$1 AND job_id=$2 AND evidence_id=$3 ORDER BY signal_id",[tenantId,jobId,source.finalized_id])).rows.map(row=>row.signal_id);
   // Successful empty output is explicit. A missing/quarantined upload is refused by the checked trigger.
   for(const stage of ["detection","reconciliation"]) await db.query("INSERT INTO app.shadow_final_check_source_attempt(tenant_id,job_id,manifest_id,source_id,id,execution_id,stage,version,input_hash,outcome,result_hash,result_signal_ids,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic-fixture.v1',$8,'succeeded',$9,$10,$11,$12,$13,$14::timestamptz)",[tenantId,jobId,manifestId,source.id,fixtureId("source",`${source.id}:${stage}`),executionId,stage,stage==='detection'?source.frozen_input_hash:LOCK_HASH,LOCK_HASH,signalIds,source.finalized_id,source.finalized_version,source.finalized_hash,source.finalized_received]);
  }
  for(const signal of signals) {
   const classification=fixtureId("signal",`${signal.id}:classification`);
   await db.query("INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES($1,$2,$3,$4,$5,'not_enough_evidence')",[tenantId,jobId,classification,runId,signal.id]);
   await db.query("INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,signal_id,classification_id,projection_version,result_descriptor) VALUES($1,$2,$3,$4,$5,$6,'final-check-result.v1',$7::jsonb)",[tenantId,jobId,runId,fixtureId("signal",`${signal.id}:result`),signal.id,classification,JSON.stringify({version:'final-check-result.v1',outcome:'not_enough_evidence',signalId:signal.id,classificationId:classification})]);
  }
  if(!signals.length) await db.query("INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,projection_version,result_descriptor) VALUES($1,$2,$3,$4,'final-check-result.v1',$5::jsonb)",[tenantId,jobId,runId,fixtureId("source","zero-result"),JSON.stringify({version:'final-check-result.v1',outcome:'zero_result'})]);
  await db.query("INSERT INTO app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5,$6,$7,'synthetic-fixture.v1','synthetic-fixture.v1')",[tenantId,jobId,runId,manifestId,lock.id,lock.cutoff,executionId]);
  await db.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status,run_id) VALUES($1,$2,$3,$4,$5,'completed',$6)",[tenantId,jobId,checkId,lock.id,lock.cutoff,runId]);
  return checkId;
 });
}
export async function publishEmptyCompletion(f: Pick<LockFixture,'shadow'|'admin'>, a: { tenantId: string; jobId: string }) {
 const count=(await f.admin.query("SELECT count(*)::int n FROM app.evidence_upload u JOIN app.final_account_lock l ON(l.tenant_id,l.job_id)=(u.tenant_id,u.job_id) WHERE u.tenant_id=$1 AND u.job_id=$2 AND u.server_received_at<=l.locked_at",[a.tenantId,a.jobId])).rows[0].n;
 if(count!==0) throw new Error("fixture requires a genuinely empty manifest");
 return publishFixtureCompletion(f.shadow,f.admin,a.tenantId,a.jobId);
}
/** A fixture established before 0147 remains historical; it deliberately uses the old issue path. */
export async function prepareInvoicePrerequisites(admin: Pool, runtime: Pool, tenantId: string, jobId: string, actorMembershipId: string, revisionId: string) {
 if(!(await admin.query("SELECT to_regclass('app.shadow_final_check_completion') installed")).rows[0].installed) return;
 // Legacy fixtures transition a draft directly, without inserting job_activation (SH-1's track binding).
 // Establish the synthetic small-builder premise explicitly; never rewrite an existing track.
 await asFixtureTenant(admin,tenantId,db=>db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) SELECT tenant_id,id,'small_builder','synthetic_demo','legacy_synthetic_live_fixture' FROM app.job WHERE tenant_id=$1 AND id=$2 AND status IN ('live','invoiced','paid') ON CONFLICT(tenant_id,job_id) DO NOTHING",[tenantId,jobId]));
 const digest=(await admin.query("SELECT practice_session_digest FROM app.job WHERE tenant_id=$1 AND id=$2",[tenantId,jobId])).rows[0].practice_session_digest;
 const context=testTenantContext(tenantId),repo=new FinalAccountLockRepository(digest?practiceMaterialPool(runtime,digest):runtime);
 await repo.acceptTerms(context,{actorMembershipId,commandId:randomUUID(),termsVersion:'synthetic_final_check_terms.v1'});
 const scope=(await admin.query("SELECT DISTINCT scope_item_id FROM app.final_account_line WHERE tenant_id=$1 AND job_id=$2 AND final_account_revision_id=$3 AND line_kind='baseline'",[tenantId,jobId,revisionId])).rows;
 for(const item of scope) await repo.disposition(context,{jobId,actorMembershipId,commandId:randomUUID(),scopeItemId:item.scope_item_id,disposition:'done'});
 const revision=(await admin.query("SELECT revision FROM app.final_account_revision WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[tenantId,jobId,revisionId])).rows[0].revision;
 await repo.lock(context,{jobId,actorMembershipId,commandId:randomUUID(),finalAccountRevisionId:revisionId,expectedRevision:revision,declarationVersion:'final_account_declaration.v1'});
 const connection=admin.options,login=`sv5pre_fixture_${randomUUID().replaceAll('-','')}`,material=randomUUID();
 await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${material}'; GRANT jobguard_shadow TO ${login}`);
 // pg defaults database to user when absent; a fixture login is not a database.
 const database=(await admin.query("SELECT current_database() name")).rows[0].name;
 const shadow=new Pool({...connection,database,user:login,password:material,max:1});
 try { await publishFixtureCompletion(shadow,admin,tenantId,jobId); } finally { await shadow.end(); }
}

/** Actually issues under the preceding schema; no later lock/completion is invented. */
export async function createHistoricalInvoice() {
 const fixture=await createLockFixture(false);
 try {
  const { MIGRATION_URLS }=await import('../src/migrate.js'),{readFile}=await import('node:fs/promises');
  await fixture.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS) {
   const name=url.pathname.split('/').at(-1)!;if(name==='0237_final_check_prerequisites.sql') break;
   await fixture.admin.query(await readFile(url,'utf8'));
   await fixture.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
  }
  await installLegacySyntheticPartyFixtures(fixture.admin);const account=await seedAccount(fixture.admin);
  const {PracticeInvoiceRepository}=await import('../src/practice-invoice-repository.js');
  const command={jobId:account.jobId,finalAccountRevisionId:account.revisionId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),recipient:'practice-customer@example.invalid',issuedOn:'2026-10-12'};
  const invoice=await new PracticeInvoiceRepository(fixture.runtime).issue(account.context,command);
  await migrate(fixture.admin);
  return {fixture,account,invoice,command,close:()=>closeLockFixture(fixture)};
 } catch(error) { await closeLockFixture(fixture);throw error; }
}

/** Set-up only (per C135): a legacy fixture job gets one baseline line, accepted terms, a lock and a checked completion before its first issue. */
export async function prepareBaselineInvoice(admin: Pool, runtime: Pool, tenantId: string, jobId: string, actorMembershipId: string, revisionId: string, quoteId: string, net: number) {
 const scopeItemId=randomUUID();
 await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scopeItemId,tenantId,jobId]);
 await admin.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',$7,1)",[randomUUID(),tenantId,jobId,revisionId,quoteId,scopeItemId,net]);
 await prepareInvoicePrerequisites(admin,runtime,tenantId,jobId,actorMembershipId,revisionId);
}

/** Per C204: a genuinely historical, unlocked invoice. The pre-guard routine from migration 0187 is installed unchanged under another name and
 * called as admin, so the job is invoiced without any lock, track or completion, exactly as invoices issued before the lock existed. */
export async function issueHistoricalInvoice(admin: Pool, tenantId: string, input: { jobId: string; finalAccountRevisionId: string; actorMembershipId: string; commandId?: string; recipient?: string; issuedOn?: string }) {
 const { readFile } = await import('node:fs/promises');
 const text = await readFile(new URL('../migrations/0187_final_account_sources_and_pdf.sql', import.meta.url), 'utf8');
 const start = text.indexOf('CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice(');
 const end = text.indexOf('END $$;', start) + 'END $$;'.length;
 if (start < 0 || end <= start) throw new Error('historical issuer source not found');
 await admin.query(text.slice(start, end).replace('app.issue_practice_customer_invoice(', 'app.historical_issue_practice_customer_invoice('));
 await admin.query('REVOKE ALL ON FUNCTION app.historical_issue_practice_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,date) FROM PUBLIC');
 const db = await admin.connect();
 try {
  await db.query('BEGIN'); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
  await db.query('SELECT * FROM app.historical_issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)', [tenantId, input.jobId, input.finalAccountRevisionId, input.actorMembershipId, input.commandId ?? randomUUID(), input.recipient ?? 'allocation@example.invalid', input.issuedOn ?? '2026-10-12']);
  await db.query('COMMIT');
 } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
