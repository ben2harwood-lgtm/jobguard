import { permitPracticeHomeJob } from "./lp-practice-home-job-fixture.js";
// Synthetic parent fixtures only. No source qualification or financial authority is implied.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { recoveryAttributionRevisionV1, attributionPredicates, candidateM1TaxPolicy, money, addMoney } from "@jobguard/core";
import { migrate } from "../src/migrate.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
export const LOCK_OWNER = "40000000-0000-4000-8000-000000000004";
export const LOCK_USER = "30000000-0000-4000-8000-000000000003";
export const LOCK_HASH = "a".repeat(64);
export type LockFixture = { postgres: EmbeddedPostgres; directory: string; port: number; credential: string; admin: Pool; runtime: Pool; shadow: Pool; owner: Pool };
export async function createLockFixture(install = true): Promise<LockFixture> {
 const directory = await mkdtemp(join(tmpdir(), "sv4-pg16-")), port = await freePort(58400, 250), credential = randomUUID();
 const connection = { host: "127.0.0.1", port, database: "postgres", user: "postgres", password: credential };
 const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start();
 const bootstrap = new Pool(connection);
 await bootstrap.query("CREATE DATABASE jobguard_synthetic_demo"); await bootstrap.end();
 connection.database="jobguard_synthetic_demo";
 const admin = new Pool(connection);
 if (install) { await migrate(admin); await installLegacySyntheticPartyFixtures(admin); }
 const pools: Pool[] = [];
 for (const role of ["jobguard_runtime", "jobguard_shadow", "jobguard_migration"]) {
  const login = `sv4_${randomUUID().replaceAll("-", "")}`;
  if (install) await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT ${role} TO ${login}`);
  pools.push(new Pool({ ...connection, user: install ? login : "postgres", max: 4 }));
 }
 return { postgres, directory, port, credential, admin, runtime: pools[0]!, shadow: pools[1]!, owner: pools[2]! };
}
export async function closeLockFixture(f: LockFixture) { await closeTestPools(f.runtime, f.shadow, f.owner, f.admin); await f.postgres.stop(); await rm(f.directory, { recursive: true, force: true }); }
export async function asFixtureTenant<T>(pool: Pool, tenantId: string, work: (db: PoolClient) => Promise<T>): Promise<T> {
 const db = await pool.connect();
 try { await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]); const result = await work(db); await db.query("COMMIT"); return result; }
 catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
export async function seedAccount(admin: Pool, tenantId: string = randomUUID(), net = 3360000, practiceDigest: string | null = null) {
 const tax=candidateM1TaxPolicy.calculateGroup(money(net),"standard_rate_20"),gross=addMoney(money(net),tax);
 const jobId = randomUUID(), scopeItemId = randomUUID(), baselineId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID(), lineId = randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenantId]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [LOCK_USER]);
 const account = randomUUID();
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SV-4')", [account, tenantId]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [LOCK_OWNER, tenantId, account, LOCK_USER]);
 await asFixtureTenant(admin, tenantId, async db => {
  if (practiceDigest !== null && (await db.query("SELECT to_regclass('app.lp_job_insert_permit') IS NOT NULL installed")).rows[0].installed) await permitPracticeHomeJob(db, {tenantId,jobId,actorMembershipId:LOCK_OWNER,
   title:"Fictional final account",status:"live",practiceSessionDigest:practiceDigest});
  await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional final account','live',$3::text,CASE WHEN $3::text IS NULL THEN NULL ELSE 'home' END)", [jobId, tenantId, practiceDigest]);
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

export async function attributionParents(f: LockFixture, tenantId?: string, practiceDigest: string | null = null) {
 const a = await seedAccount(f.admin,tenantId,3360000,practiceDigest);
 const locks = await prepareLock(f,a);
 await locks.lock(a.context,a.input);
 const lockId = (await f.admin.query("SELECT id FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].id as string;
 const caseId = randomUUID();
 await f.admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,synthetic) VALUES($1,$2,$3,80000,'GBP','identified',true)",[caseId,a.tenantId,a.jobId]);
 return {...a,lockId,caseId,workId:randomUUID()};
}

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), workId: id(3), lineId: id(4), lockId: id(5) };
const kinds = ["evidence", "disclosure", "baseline_manifest", "capture_manifest", "locked_bill_manifest", "reveal", "disposition", "invoice_line", "line_allocation", "line_reversal"] as const;
export const attributionDocumentFixture = () => ({
  version: "recovery-attribution-revision.v1", ...binding, caseId: id(6), environment: "synthetic_demo", productionEnabled: false, realExternalActions: 0,
  assessmentId: id(7), revision: 1, previousAssessmentId: null, caseRevision: 1, sourceRevision: "sources.1", sourceHash: "a".repeat(64),
  sourceManifest: kinds.map((kind, i) => ({ kind, sourceId: id(20 + i), sourceVersion: "1", sourceHash: "b".repeat(64), tenantId: binding.tenantId, jobId: binding.jobId })),
  completeManifests: ["baseline_manifest", "capture_manifest", "locked_bill_manifest"].map((kind, i) => ({ kind, sourceId: id(22 + i), lockId: binding.lockId, status: "completed", itemIds: [], itemCount: 0 })),
  facts: { version: "shadow-attribution.v1", policyVersion: "shadow_attribution_policy_v3", ...binding, revisionId: id(7), disputeReview: null, exclusions: [], facts: Object.fromEntries(attributionPredicates.map((predicate, i) => [predicate, { version: "shadow-fact.v1", ...binding, predicate, holds: true, sourceRef: id(20 + i) }])) },
  remainingPrincipal: { numerator: "80000", denominator: "1" }, assessmentOutcome: "eligible_for_review", reasonCodes: [] as string[],
  attributionPolicyVersion: "shadow_attribution_policy_v3", eligibilityPolicyVersion: "reference_recovery_eligibility_policy_v3", policyBundleRef: "fixture-policy-bundle.v1",
  assessedBy: { kind: "membership", actorRef: id(8) }, serverRecordedAt: "2026-10-23T12:00:00Z",
});

export async function storedAttributionFixture(f: LockFixture, tenantId?: string, practiceDigest: string | null = null) {
 const p=await attributionParents(f,tenantId,practiceDigest), raw=attributionDocumentFixture();
 const bind={tenantId:p.tenantId,jobId:p.jobId,workId:p.workId,lineId:p.lineId,lockId:p.lockId};
 Object.assign(raw,bind,{caseId:p.caseId,assessmentId:randomUUID()});
 Object.assign(raw.facts,bind,{revisionId:raw.assessmentId});
 for(const fact of Object.values(raw.facts.facts))Object.assign(fact,bind);
 for(const source of raw.sourceManifest)Object.assign(source,{tenantId:p.tenantId,jobId:p.jobId});
 for(const m of raw.completeManifests)m.lockId=p.lockId;
 const document=recoveryAttributionRevisionV1.parse(raw);
 const command={version:"recovery-attribution-command.v1",action:"assess",commandId:randomUUID(),caseId:p.caseId,workId:p.workId,lineId:p.lineId,lockId:p.lockId,expectedCaseRevision:1,expectedAttributionRevision:0};
 return {p,document,command};
}
