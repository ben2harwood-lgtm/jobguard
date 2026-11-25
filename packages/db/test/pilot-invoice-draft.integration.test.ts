import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { pilotApprovalFixture } from "../../config/src/policy-gates.pilot-test-fixture.js";
import { requirePilotG1 } from "../../config/src/policy-gates.js";
import { pilotFinalCheckDiscovery, pilotFinalCheckExecutor, pilotWorkerTasks } from "../../../apps/api/src/pilot-worker.js";
import { generatePracticePng } from "../src/practice-proof-image.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { migrate } from "../src/migrate.js";
import { FinalCheckCompletionRepository, pilotFixtureFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { verifiedTenantContextForQueuedJob, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
import { startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";
import { finalCheckTenant } from "./final-check-fixture.js";

const { makeWorkerUtils, runOnce } = createRequire(new URL("../../../apps/api/package.json", import.meta.url))("graphile-worker");
const queueSchema = "jobguard_pilot_queue";
const database = "jobguard_pilot_draft";
const migration = "0777_pilot_final_check.sql";
const digest = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
const terms = "pilot_final_check_terms.v1";
function executor(gate: () => void) {
  const execute = pilotFinalCheckExecutor(shadow, gate, pool => {
    const completion = new FinalCheckCompletionRepository(pool);
    return { worker: pilotFixtureFinalCheckPorts(pool, digest(generatePracticePng())), publish: completion.publish.bind(completion) };
  });
  return (task: Parameters<typeof execute>[1]) => execute(verifiedTenantContextForQueuedJob(task.tenantId), task);
}
let c: Cluster;
let shadow: Pool;
let otherShadow: Pool;
let queue: Pool;

beforeAll(async () => {
  c = await startBeforeMigration(migration, database);
  const predecessor = await c.admin.query("SELECT max(migration_name) AS migration FROM public.jobguard_schema_migration");
  expect(predecessor.rows[0]?.migration).toBe("0776_pilot_final_account.sql");
  expect((await c.admin.query("SELECT to_regclass('control_plane.pilot_final_check_binding') binding")).rows[0]?.binding).toBeNull();
  const legacyLock = randomUUID();
  const legacy = await c.admin.query(
    "INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id) VALUES($1,$2,$3) RETURNING row_to_json(final_check_request) snapshot",
    [legacyLock, randomUUID(), randomUUID()]);
  await c.admin.query(`CREATE ROLE jobguard_pilot_shadow_login LOGIN PASSWORD 'fictional-shadow';
    CREATE ROLE other_shadow LOGIN PASSWORD 'fictional-other-shadow';
    CREATE ROLE jobguard_pilot_queue_login LOGIN PASSWORD 'fictional-queue';
    GRANT jobguard_shadow TO jobguard_pilot_shadow_login,other_shadow`);
  await c.admin.query("CREATE DATABASE jobguard_pilot_queue");
  await c.admin.query("GRANT CREATE ON DATABASE jobguard_pilot_queue TO jobguard_pilot_queue_login");
  await c.admin.query("REVOKE CONNECT ON DATABASE jobguard_pilot_draft FROM PUBLIC");
  await c.admin.query("GRANT CONNECT ON DATABASE jobguard_pilot_draft TO ent4b_login,jobguard_pilot_shadow_login,other_shadow");
  shadow = new Pool({ ...c.config, database, user: "jobguard_pilot_shadow_login", password: "fictional-shadow" });
  otherShadow = new Pool({ ...c.config, database, user: "other_shadow", password: "fictional-other-shadow" });
  queue = new Pool({ ...c.config, database: "jobguard_pilot_queue", user: "jobguard_pilot_queue_login", password: "fictional-queue" });
  await migrate(c.admin);
  await migrate(c.admin);
  await c.admin.query("GRANT jobguard_pilot_draft TO jobguard_pilot_shadow_login");
  expect((await c.admin.query("SELECT row_to_json(q) snapshot FROM infrastructure.final_check_request q WHERE lock_id=$1", [legacyLock])).rows)
    .toEqual(legacy.rows);
  expect((await shadow.query("SELECT * FROM app.pilot_final_check_requests()")).rows).toEqual([]);
  await c.admin.query(`
    CREATE FUNCTION app.expire_test_pilot_scope() RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
      UPDATE control_plane.lp11_shadow_scope SET expires_at=clock_timestamp()-interval '1 second'
      WHERE transaction_id=pg_current_xact_id_if_assigned() AND login=session_user
    $$;
    ALTER FUNCTION app.expire_test_pilot_scope() OWNER TO jobguard_session_lookup;
    REVOKE ALL ON FUNCTION app.expire_test_pilot_scope() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.expire_test_pilot_scope() TO jobguard_shadow;
  `);
}, 180_000);
afterAll(async () => {
  await Promise.all([shadow?.end(), otherShadow?.end(), queue?.end()]);
  await c?.close();
});
afterEach(() => vi.unstubAllEnvs());

async function fixture({ approved = true, photo }: { approved?: boolean; photo?: string } = {}) {
  const [tenantId, account, member, user, jobId, scope, baseline, draft, revision, upload, evidence] = Array.from({ length: 11 }, () => randomUUID()) as [string, string, string, string, string, string, string, string, string, string, string];
  const credential = digest(randomUUID());
  const env = pilotApprovalFixture().env;
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const gate = () => requirePilotG1(process.env);
  const admin = c.admin;
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${user}@fixture.invalid`, user]);
  await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional builder')", [tenantId, account]);
  await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [tenantId, member, account, user]);
  await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenantId, member]);
  await admin.query("INSERT INTO identity.session(id,user_id,token_digest,csrf_token,expires_at,environment) VALUES($1,$2,$3,'fixture',clock_timestamp()+interval '1 hour','pilot_no_charge')",
    [randomUUID(), user, credential]);
  await admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional extension','draft')", [tenantId, jobId]);
  await finalCheckTenant(admin, tenantId, db => seedSyntheticPartyFixture(db, tenantId, jobId));
  await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','pilot_no_charge','pilot_capture')", [tenantId, jobId]);
  await admin.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2", [tenantId, jobId]);
  await admin.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')", [tenantId, scope, jobId]);
  await admin.query("INSERT INTO app.quote_version(tenant_id,id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')", [tenantId, baseline, jobId, digest("baseline")]);
  await admin.query("INSERT INTO app.final_account_draft(tenant_id,id,job_id) VALUES($1,$2,$3)", [tenantId, draft, jobId]);
  await admin.query(`INSERT INTO app.final_account_revision(tenant_id,id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',100000,20000,120000,false,'[]')`, [tenantId, revision, jobId, draft, digest("account"), baseline]);
  await admin.query(`INSERT INTO app.final_account_line(tenant_id,id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
    VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional extension',100000,1)`, [tenantId, randomUUID(), jobId, revision, baseline, scope]);
  await admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, draft, revision]);
  if (approved) await approve(tenantId, terms);
  if (photo) {
    const key = `tenants/${tenantId}/uploads/${upload}`;
    await finalCheckTenant(admin, tenantId, async db => {
      await db.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'image/png',1000000,'standard_evidence',clock_timestamp()+interval '1 hour')`, [tenantId, upload, jobId, scope, key, photo]);
      await db.query(`UPDATE app.evidence_upload SET state='verified',object_version_id='fictional-v1',server_verified_at=clock_timestamp()
        WHERE tenant_id=$1 AND id=$2`, [tenantId, upload]);
      await db.query(`INSERT INTO app.evidence_object(tenant_id,id,job_id,scope_item_id,upload_id,object_key,object_version_id,sha256,content_type,byte_length,evidence_type,kind,retention_class,server_received_at,server_verified_at)
        VALUES($1,$2,$3,$4,$5,$6,'fictional-v1',$7,'image/png',100,'completion_photo','original','standard_evidence',clock_timestamp(),clock_timestamp())`, [tenantId, evidence, jobId, scope, upload, key, photo]);
    });
  }
  const context = verifiedTenantContextFromMembership({ tenantId, membershipId: member, identityUserId: user } as AuthenticatedMembership, { kind: "real", credential });
  const locks = new FinalAccountLockRepository(c.runtime);
  await locks.disposition(context, { jobId, actorMembershipId: member, commandId: randomUUID(), scopeItemId: scope, disposition: "done" }, gate);
  return { tenantId, jobId, context, credential, member, evidence, gate, lock: () => locks.lock(context, { jobId, actorMembershipId: member,
    commandId: randomUUID(), finalAccountRevisionId: revision, expectedRevision: 1, declarationVersion: "final_account_declaration.v1" }, gate) };
}

async function approve(tenantId: string, version: string) {
  await c.admin.query("INSERT INTO app.pilot_final_check_terms_approval(tenant_id,version,approval_sha256) VALUES($1,$2,$3)", [tenantId, version, digest(version)]);
}

async function lockTask(f: Awaited<ReturnType<typeof fixture>>, ack = true) {
  const lock = await f.lock();
  const { rows } = await shadow.query("SELECT * FROM app.pilot_final_check_requests()");
  const request = rows.find(row => row.lock_id === lock.id);
  expect(request).toMatchObject({ tenant_id: f.tenantId, job_id: f.jobId });
  if (ack) await shadow.query("SELECT app.pilot_final_check_ack($1,$2,$3,$4)", [f.tenantId, f.jobId, lock.id, request.manifest_id]);
  return { version: "final-check-task.v1" as const, tenantId: f.tenantId, jobId: f.jobId, lockId: lock.id,
    manifestId: request.manifest_id as string, executionId: randomUUID() };
}


// Same fictional persisted-session/lock/worker fixture as PILOT-05b, with the real draft reader.
import { pilotInvoiceDraft } from "../../../apps/api/src/workspace/pilot-invoice-draft.js";
import { pilotJobAccess } from "../../../apps/api/src/workspace/pilot-job-access.js";
import { FirmProfileRepository } from "../src/firm-profile-repository.js";
import { pilotDraftStatements } from "../../core/src/pilot-invoice-draft.js";

it("reads a completed pilot account repeatedly without financial, issue, receipt or outbox writes", async () => {
  const f = await fixture();
  const task = await lockTask(f);
  await executor(f.gate)(task);
  await new FirmProfileRepository(c.runtime).save(f.context, { version: "firm-profile.v1",
    tradingName: "Fictional draft builder", addressLines: ["1 Fixture Lane"], contactEmail: "builder@fixture.invalid", contactPhone: "" });
  const app = pilotInvoiceDraft(c.runtime, f.context, pilotJobAccess(c.runtime, f.context));
  // Full immutable snapshots detect updates as well as new financial/execution rows.
  const tables = ["customer_invoice", "command_receipt", "audit_event", "action_outbox", "journal", "journal_line", "customer_payment", "customer_payment_reversal"];
  const counts = async () => Object.fromEntries(await Promise.all(tables.map(async table => {
    return [table, (await c.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) value FROM app.${table} t`)).rows[0].value];
  })));
  const other = await fixture();
  const foreignApp = pilotInvoiceDraft(c.runtime, other.context, pilotJobAccess(c.runtime, other.context));
  await expect(foreignApp.read(f.jobId)).rejects.toThrow();
  const before = await counts();
  const source = await app.read(f.jobId);
  const raw = { version: "pilot-invoice-draft.v1", binding: source.binding, format: "preview",
    checklist: { ...Object.fromEntries(Object.keys(pilotDraftStatements).map(key => [key, true])), vatNumber: "GB123456789" } };
  for (let repeat = 0; repeat < 3; repeat++) expect(await app.prepare(f.jobId, raw)).toMatchObject({
    netPence: 100000, candidateVatPence: 20000, grossPence: 120000, accountRevision: 1,
  });
  expect(await counts()).toEqual(before);
  await expect(app.read(randomUUID())).rejects.toThrow();
  const changed = { ...raw, checklist: { ...raw.checklist, noEnergySaving: false } };
  await expect(app.prepare(f.jobId, changed)).rejects.toThrow("REVIEW_INCOMPLETE");
  await new FirmProfileRepository(c.runtime).save(f.context, { version: "firm-profile.v1",
    tradingName: "Changed fictional builder", addressLines: ["2 Fixture Lane"], contactEmail: "builder@fixture.invalid", contactPhone: "" });
  await expect(app.prepare(f.jobId, raw)).rejects.toThrow("STALE_REVISION");
  await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.tenantId,f.member]);
  await expect(app.prepare(f.jobId, raw)).rejects.toThrow();
});
