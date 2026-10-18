// Written first; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { practiceMovementCatalogueV1, recoveryFixtureDefinitionV3 } from "@jobguard/core";
import {
  authenticatePracticeSession, issuePracticeSession, migrate, MIGRATION_URLS, PracticeFeedRepository,
  practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, withTenant,
} from "../src/index.js";
import { appendAuditBatch } from "../src/audit.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const ctx = testTenantContext(T), actor = { membershipId: M, identityUserId: U };
const migrationName = "0127_recovery_timing_pin.sql", functionName = "app.pin_recovery_timing_created_at()";
const tables = ["practice_feed_event", "recovery_case"] as const;
const past = "2000-01-01T00:00:00Z", future = "2099-01-01T00:00:00Z";
const receipt = practiceMovementCatalogueV1.find(entry => entry.movement === "receipt-3000")!;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const previousEnvironment = process.env.JOBGUARD_ENV;
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string, port: number;
const login = "stored_times_login";
const connectionOptions = (database: string, user: string) => ({ host: "127.0.0.1", port, database, user, password: "synthetic" });

async function seed(db: Pool) {
  await db.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [T]);
  await db.query("INSERT INTO identity.identity_user(id) VALUES($1)", [U]);
  await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Stored times synthetic')", [A, T]);
  await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [M, T, A, U]);
}
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  directory = await mkdtemp(join(tmpdir(), "jg-stored-times-"));
  port = await freePort(62500, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool(connectionOptions("postgres", "postgres"));
  await migrate(admin); await seed(admin);
  await admin.query("CREATE ROLE stored_times_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO stored_times_login");
  runtime = new Pool(connectionOptions("postgres", login));
}, 40_000);
afterAll(async () => {
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = previousEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture(db = admin, business = runtime) {
  const sessionId = await issuePracticeSession(business), auth = await authenticatePracticeSession(business, sessionId), jobId = randomUUID();
  await db.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Stored times generated job',$3,'capture')", [jobId, T, auth.digest]);
  const cases = new RecoveryCaseRepository(practiceMaterialPool(business, auth.digest));
  const feed = new PracticeFeedRepository(business, "synthetic_demo");
  const repo = new RecoveryEligibilityV3Repository(practiceMaterialPool(business, auth.digest), "synthetic_demo");
  let revision = 0;
  const connect = await feed.command(ctx, actor, auth.digest, jobId, { version: "practice-feed-command.v1", action: "connect", commandId: randomUUID(), expectedRevision: revision });
  revision = connect.revision;
  const advance = async () => {
    const reply = await feed.command(ctx, actor, auth.digest, jobId, { version: "practice-feed-command.v1", action: "advance", commandId: randomUUID(), expectedRevision: revision, movement: receipt.movement, step: "settled" });
    revision = reply.revision;
    return reply;
  };
  const open = () => cases.command(ctx, jobId, {
    version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), expectedRevision: 0,
    caseType: "withheld_customer_payment", claimedNetPence: receipt.grossPence, counterparty: "Fictional debtor",
    book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"],
  }, actor);
  return { db, business, auth, jobId, cases, repo, advance, open, accountId: connect.accountId!, nextRevision: () => revision + 1 };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function rawCase(f: Fixture, chosen: string, role: "jobguard_runtime" | "jobguard_migration" | "postgres" = "jobguard_runtime", history = false) {
  const pool = role === "jobguard_runtime" ? f.business : f.db;
  return withTenant(pool, ctx, async db => {
    if (role === "jobguard_migration") await db.$client.query("SET LOCAL ROLE jobguard_migration");
    const id = randomUUID(), commandId = randomUUID(), hash = sha256(commandId);
    const saved = (await db.$client.query<{ id: string; pinned: boolean; kept_chosen: boolean }>(`INSERT INTO app.recovery_case
      (id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs,created_at)
      VALUES($1,$2,$3,$4,'GBP','identified',0,true,'withheld_customer_payment','Fictional debtor','builder_customer','customer_invoice',$5,$6)
      RETURNING id,created_at=transaction_timestamp() pinned,created_at=$6::timestamptz kept_chosen`,
    [id, T, f.jobId, receipt.grossPence, JSON.stringify(["Generated customer invoice INV-18800"]), chosen])).rows[0]!;
    if (history) {
      await db.$client.query(`INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash)
        VALUES($1,$2,$3,$4,1,$5,'GBP',$6,$7)`, [randomUUID(), T, f.jobId, id, receipt.grossPence, `membership:${M}`, hash]);
      await db.$client.query(`INSERT INTO app.recovery_case_event(id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,reviewer_ref,command_id,payload_hash)
        VALUES($1,$2,$3,$4,1,'opened',NULL,'identified',$5,$6,$7)`, [randomUUID(), T, f.jobId, id, `membership:${M}`, commandId, hash]);
    }
    return saved;
  });
}
async function rawAdvance(f: Fixture, chosen: string) {
  return withTenant(f.business, ctx, async db => {
    await db.$client.query("SELECT set_config('app.practice_feed_session_digest',$1,true),set_config('app.practice_feed_environment','synthetic_demo',true)", [f.auth.digest]);
    const commandId = randomUUID(), id = randomUUID(), payloadHash = sha256(commandId);
    await db.$client.query(`INSERT INTO app.practice_feed_command(id,tenant_id,job_id,account_id,revision,action,movement_key,step,actor_membership_id,payload_hash,environment)
      VALUES($1,$2,$3,$4,$5,'advance',$6,'settled',$7,$8,'synthetic_demo')`,
    [commandId, T, f.jobId, f.accountId, f.nextRevision(), receipt.movement, M, payloadHash]);
    const eventId = `settled-${receipt.movement}`;
    const hash = sha256(["practice-feed-event.v1", "synthetic_demo", T, f.jobId, f.accountId, eventId, "settled", receipt.movement, "identified", "feed", receipt.grossPence, "GBP", "settled"].join("|"));
    const saved = (await db.$client.query<{ id: string; pinned: boolean; kept_chosen: boolean }>(`INSERT INTO app.practice_feed_event
      (id,tenant_id,job_id,account_id,command_id,event_kind,movement_key,event_id,identity,representation_id,gross_pence,currency,state,environment,version,source_hash,created_at)
      VALUES($1,$2,$3,$4,$5,'settled',$6,$7,'identified','feed',$8,'GBP','settled','synthetic_demo','practice-feed-event.v1',$9,$10)
      RETURNING id,created_at=transaction_timestamp() pinned,created_at=$10::timestamptz kept_chosen`,
    [id, T, f.jobId, f.accountId, commandId, receipt.movement, eventId, receipt.grossPence, hash, chosen])).rows[0]!;
    await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${M}`, eventType: "practice_feed.advance", subjectType: "job", subjectRef: f.jobId,
      payload: { references: { commandId, accountId: f.accountId, sessionDigest: f.auth.digest }, hashes: { command: payloadHash }, classifications: { practiceFeed: "financial" } } }]);
    return saved;
  });
}
async function assertReview(f: Fixture, caseId: string, name: "F18" | "F19", before: boolean) {
  const current = (await f.db.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [T, caseId])).rows[0]!;
  const command = { version: "recovery-eligibility-command.v3", action: "review", commandId: randomUUID(), caseId, expectedCaseRevision: current.revision, expectedReviewRevision: 0, fixture: name };
  if (name === "F18" && !before) { await advanceInterestFact(f, "receipt-interest-120"); await advanceInterestFact(f, "receipt-compensation-70"); }
  const saved = await f.repo.review(ctx, f.jobId, command, actor, f.auth.digest);
  const lines = recoveryFixtureDefinitionV3(name).lines;
  const full = lines.filter(line => line.kind === "principal" || line.kind === "statutory_interest" && line.debtorType === "business").reduce((sum, line) => sum + line.netPence, 0);
  expect(saved.result).toMatchObject({ outcome: before ? "excluded" : "eligible_for_review", qualifyingPrincipal: { pence: before ? 0 : full, currency: "GBP" },
    reason: before ? "Paid before you opened this case" : "Fixed statutory compensation is not part of the fee base" });
  expect((await f.cases.listForMember(ctx, f.jobId, actor)).find(row => row.id === caseId)?.eligibilityV3).toEqual(saved);
  expect((await f.db.query("SELECT result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND id=$2", [T, saved.id])).rows).toEqual([{ result: saved.result }]);
  expect(await f.repo.review(ctx, f.jobId, command, actor, f.auth.digest)).toEqual(saved);
  return saved;
}

// Ruling 66: the same separate-component setup path used by ruling 55(a).
async function advanceInterestFact(f: Fixture, movement: "receipt-interest-120" | "receipt-compensation-70", step = "settled") {
  const feed = new PracticeFeedRepository(f.business, "synthetic_demo");
  const current = await feed.factsView(ctx, actor, f.auth.digest, f.jobId);
  return feed.factsCommand(ctx, actor, f.auth.digest, f.jobId, { version: "practice-facts-command.v1", commandId: randomUUID(), expectedRevision: current.revision, action: "advance", movement, step });
}

it("[AC1] ordinary insert triggers and invoker function have the exact catalog shape", async () => {
  const triggers = (await admin.query(`SELECT c.relname,pg_get_triggerdef(t.oid) definition,t.tgenabled FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgfoid=$1::regprocedure AND t.tgname='a_recovery_timing_pin' AND c.relname=ANY($2::text[]) ORDER BY c.relname`, [functionName, tables])).rows;
  expect(triggers).toEqual(tables.map(table => ({ relname: table, definition: `CREATE TRIGGER a_recovery_timing_pin BEFORE INSERT ON app.${table} FOR EACH ROW EXECUTE FUNCTION app.pin_recovery_timing_created_at()`, tgenabled: "O" })));
  expect((await admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,
    has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime_exec,
    has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure_exec,
    has_function_privilege('jobguard_identity',oid,'EXECUTE') identity_exec FROM pg_proc WHERE oid=$1::regprocedure`, [functionName])).rows).toEqual([
    { owner: "jobguard_migration", prosecdef: false, proconfig: ["search_path=pg_catalog"], runtime_exec: false, infrastructure_exec: false, identity_exec: false },
  ]);
  expect((await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') public_exec`, [functionName])).rows).toEqual([{ public_exec: false }]);
});
it.each(tables)("[AC2] timing pin fires first on %s and merged insert guards remain", async table => {
  const names = (await admin.query(`SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal AND (tgtype & 7)=7 ORDER BY tgname COLLATE "C"`, [`app.${table}`])).rows.map(row => row.tgname);
  expect(names[0]).toBe("a_recovery_timing_pin");
  expect(names).toContain(table === "recovery_case" ? "recovery_message_source_write" : "practice_feed_event_guard");
});
it.each([past, future])("[AC3] runtime case back-dating attempt ignores chosen time %s", async chosen => {
  expect(await rawCase(await fixture(), chosen)).toMatchObject({ pinned: true, kept_chosen: false });
});
it.each([past, future])("[AC3] valid runtime advance ignores chosen time %s", async chosen => {
  expect(await rawAdvance(await fixture(), chosen)).toMatchObject({ pinned: true, kept_chosen: false });
});
it.each(["jobguard_migration", "postgres"] as const)("[AC4] %s case insert is pinned in ordinary mode", async role => {
  expect((await admin.query("SHOW session_replication_role")).rows).toEqual([{ session_replication_role: "origin" }]);
  expect(await rawCase(await fixture(), past, role)).toMatchObject({ pinned: true, kept_chosen: false });
});
it("[AC5] product case and settled event use their transaction clock within server readings", async () => {
  const f = await fixture();
  const clock = async () => (await admin.query("SELECT clock_timestamp()::text stamp")).rows[0]!.stamp as string;
  const caseBefore = await clock(), c = await f.open(), caseAfter = await clock();
  expect((await admin.query(`SELECT c.created_at=r.created_at AND c.created_at=e.created_at same_transaction,
    c.created_at BETWEEN $3::timestamptz AND $4::timestamptz in_bounds FROM app.recovery_case c
    JOIN app.recovery_claim_revision r ON (r.tenant_id,r.case_id)=(c.tenant_id,c.id) AND r.revision=1
    JOIN app.recovery_case_event e ON (e.tenant_id,e.case_id)=(c.tenant_id,c.id) AND e.event_type='opened'
    WHERE c.tenant_id=$1 AND c.id=$2`, [T, c.id, caseBefore, caseAfter])).rows).toEqual([{ same_transaction: true, in_bounds: true }]);
  const feedBefore = await clock(); await f.advance(); const feedAfter = await clock();
  expect((await admin.query(`SELECT e.created_at=c.created_at same_transaction,e.created_at BETWEEN $3::timestamptz AND $4::timestamptz in_bounds
    FROM app.practice_feed_event e JOIN app.practice_feed_command c ON (c.tenant_id,c.id)=(e.tenant_id,e.command_id)
    WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.event_kind='settled'`, [T, f.jobId, feedBefore, feedAfter])).rows).toEqual([{ same_transaction: true, in_bounds: true }]);
});
it.each(["F18", "F19"] as const)("[AC6] %s settled then raw case with chosen past time remains excluded", async name => {
  const f = await fixture(); await f.advance(); const c = await rawCase(f, past, "jobguard_runtime", true);
  expect(c).toMatchObject({ pinned: true, kept_chosen: false }); await assertReview(f, c.id, name, true);
});
it.each(["F18", "F19"] as const)("[AC6] %s opened then raw settled row with chosen past time retains full figure", async name => {
  const f = await fixture(), c = await f.open();
  expect(await rawAdvance(f, past)).toMatchObject({ pinned: true, kept_chosen: false }); await assertReview(f, c.id, name, false);
});
it("[AC6] F18 raw settled row with chosen future time then product opening remains excluded", async () => {
  const f = await fixture(); expect(await rawAdvance(f, future)).toMatchObject({ pinned: true, kept_chosen: false });
  await assertReview(f, (await f.open()).id, "F18", true);
});
it.each(["F18", "F19"] as const)("[AC6] %s product-only controls preserve both money answers and replay", async name => {
  const before = await fixture(); await before.advance(); await assertReview(before, (await before.open()).id, name, true);
  const after = await fixture(), c = await after.open(); await after.advance(); await assertReview(after, c.id, name, false);
});

async function storedTime(f: Fixture, table: typeof tables[number], id: string) {
  return withTenant(f.business, ctx, async db => {
    const rows = (await db.$client.query(`SELECT created_at::text stamp FROM app.${table} WHERE tenant_id=$1 AND id=$2`, [T, id])).rows;
    expect(rows).toHaveLength(1); return rows[0]!.stamp as string;
  });
}
it.each(tables)("[AC7] runtime cannot update or remove a visible %s row after insert", async table => {
  const f = await fixture();
  const id = table === "recovery_case" ? (await f.open()).id : (await rawAdvance(f, past)).id;
  const original = await storedTime(f, table, id);
  for (const sql of [`UPDATE app.${table} SET created_at=$3::timestamptz WHERE tenant_id=$1 AND id=$2`, `DELETE FROM app.${table} WHERE tenant_id=$1 AND id=$2`]) {
    await expect(withTenant(f.business, ctx, db => db.$client.query(sql, sql.startsWith("UPDATE") ? [T, id, future] : [T, id]))).rejects.toMatchObject({ code: "42501" });
    expect(await storedTime(f, table, id)).toBe(original);
  }
});
it("[AC7] owner case rewrite is refused by the merged append-only trigger", async () => {
  const f = await fixture(), c = await f.open(), original = await storedTime(f, "recovery_case", c.id);
  await expect(withTenant(admin, ctx, async db => {
    await db.$client.query("SET LOCAL ROLE jobguard_migration");
    expect((await db.$client.query("SELECT id FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [T, c.id])).rowCount).toBe(1);
    await db.$client.query("UPDATE app.recovery_case SET created_at=$3::timestamptz WHERE tenant_id=$1 AND id=$2", [T, c.id, future]);
  })).rejects.toMatchObject({ code: "55000", message: "recovery history is append-only" });
  expect(await storedTime(f, "recovery_case", c.id)).toBe(original);
});
it.each(["jobguard_infrastructure", "jobguard_identity"])("[AC7] %s cannot select, insert or update either table", async role => {
  const f = await fixture(), c = await f.open(), e = await rawAdvance(f, past);
  for (const [table, id] of [["recovery_case", c.id], ["practice_feed_event", e.id]] as const) {
    const original = await storedTime(f, table, id);
    for (const sql of [`SELECT * FROM app.${table} WHERE tenant_id=$1 AND id=$2`, `INSERT INTO app.${table}(tenant_id,id) VALUES($1,$2)`, `UPDATE app.${table} SET created_at=$3::timestamptz WHERE tenant_id=$1 AND id=$2`]) {
      await expect(withTenant(admin, ctx, async db => {
        await db.$client.query(`SET LOCAL ROLE ${role}`);
        await db.$client.query(sql, sql.startsWith("UPDATE") ? [T, id, future] : [T, id]);
      })).rejects.toMatchObject({ code: "42501" });
      expect(await storedTime(f, table, id)).toBe(original);
    }
  }
});
it("[AC7] catalog denies every non-owner application role mutation; feed owner remains privileged (control)", async () => {
  for (const table of tables) {
    expect((await admin.query(`SELECT rolname FROM pg_roles WHERE rolname IN('jobguard_runtime','jobguard_infrastructure','jobguard_identity',$2)
      AND (has_table_privilege(oid,$1,'UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(oid,$1,'UPDATE'))`, [`app.${table}`, login])).rows).toEqual([]);
    expect((await admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT') i,has_table_privilege('jobguard_runtime',$1,'SELECT') s", [`app.${table}`])).rows).toEqual([{ i: true, s: true }]);
  }
  expect((await admin.query("SELECT rolname FROM pg_roles WHERE rolname IN('jobguard_runtime','jobguard_infrastructure','jobguard_identity') AND (rolsuper OR rolcreaterole OR rolbypassrls OR pg_has_role(oid,'jobguard_migration','MEMBER'))")).rows).toEqual([]);
  for (const role of ["jobguard_infrastructure", "jobguard_identity"]) expect((await admin.query("SELECT has_schema_privilege($1,'app','USAGE') access", [role])).rows).toEqual([{ access: false }]);
  const f = await fixture(), e = await rawAdvance(f, past);
  // This disposable row documents the owner boundary without granting a business role anything.
  await withTenant(admin, ctx, async db => {
    await db.$client.query("SET LOCAL ROLE jobguard_migration");
    expect((await db.$client.query("UPDATE app.practice_feed_event SET created_at=$3::timestamptz WHERE tenant_id=$1 AND id=$2 RETURNING created_at=$3::timestamptz changed", [T, e.id, future])).rows).toEqual([{ changed: true }]);
  });
});
it("[AC8] merged superuser UPDATE time-seeding pattern still works unaltered (control)", async () => {
  const f = await fixture(), c = await f.open(), e = await rawAdvance(f, past), client = await admin.connect();
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL session_replication_role=replica");
    for (const [table, id] of [["recovery_case", c.id], ["practice_feed_event", e.id]] as const) {
      expect((await client.query(`UPDATE app.${table} SET created_at=$3::timestamptz WHERE tenant_id=$1 AND id=$2 RETURNING created_at=$3::timestamptz kept_chosen`, [T, id, past])).rows).toEqual([{ kept_chosen: true }]);
    }
  } finally { await client.query("ROLLBACK"); client.release(); }
});

const rowTables = ["recovery_case", "practice_feed_event", "practice_feed_command", "recovery_claim_revision", "recovery_case_event", "recovery_eligibility_v3_review", "recovery_claim_line", "audit_event"];
async function snapshot(db: Pool) {
  const rows: Record<string, unknown> = {};
  for (const table of rowTables) rows[table] = (await db.query(`SELECT row_to_json(t)::text bytes FROM app.${table} t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;
  const catalog = (await db.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='app' AND p.tablename=c.relname) policies,
    (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tables])).rows;
  const columns = (await db.query(`SELECT c.relname,array_agg(a.attname::text ORDER BY a.attnum) columns FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='app' AND c.relname=ANY($1::text[]) GROUP BY c.relname ORDER BY c.relname`, [tables])).rows;
  const functions = (await db.query(`SELECT p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.oid::regprocedure::text<>$1 ORDER BY p.oid::regprocedure::text COLLATE "C"`, [functionName])).rows;
  const triggers = (await db.query(`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[]) AND t.tgname<>'a_recovery_timing_pin'
    ORDER BY c.relname,t.tgname COLLATE "C"`, [tables])).rows;
  return { rows, catalog, columns, functions, triggers };
}
// What the proof compares AFTER all migrations: only the rows that existed before 0127 (found again by primary key), on the columns and types they had
// before 0127, as canonical text from the database (never driver-parsed values, which round timestamps to the millisecond). Rows added later are ignored.
type Queryable = Pick<Pool | PoolClient, "query">;
type ProofTable = { names: string[]; typed: Record<string, string>; key: string[]; rows: Record<string, string> };
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
async function proofRows(db: Queryable, table: string, names: string[], key: string[]) {
  const found = (await db.query(`SELECT identity,bytes FROM (SELECT (SELECT row_to_json(k)::text FROM (SELECT ${key.map(name => `t.${ident(name)}`).join(",")}) k) AS identity,
    (SELECT row_to_json(s)::text FROM (SELECT ${names.map(name => `t.${ident(name)}`).join(",")}) s) AS bytes FROM app.${table} t) x ORDER BY identity COLLATE "C"`)).rows;
  return Object.fromEntries(found.map(row => [row.identity as string, row.bytes as string]));
}
async function proofColumns(db: Queryable, table: string) {
  return (await db.query(`SELECT a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [`app.${table}`])).rows as { name: string; type: string }[];
}
async function proofBefore(db: Queryable) {
  const proof: Record<string, ProofTable> = {};
  for (const table of rowTables) {
    const columns = await proofColumns(db, table);
    const key = (await db.query(`SELECT a.attname::text AS name FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
      WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[],a.attnum)`, [`app.${table}`])).rows.map(row => row.name as string);
    const names = columns.map(column => column.name);
    proof[table] = { names, typed: Object.fromEntries(columns.map(column => [column.name, column.type])), key, rows: await proofRows(db, table, names, key) };
  }
  return proof;
}
// Every pre-existing column whose type moved ("table: name type -> new type", a dropped column reads "(gone)") and every pre-existing row that is
// missing or whose named columns changed. A later column, or a later row, is not a difference.
async function proofDifferences(db: Queryable, proof: Record<string, ProofTable>) {
  const rows: string[] = [], types: string[] = [];
  for (const [table, was] of Object.entries(proof)) {
    const now = new Map((await proofColumns(db, table)).map(column => [column.name, column.type]));
    for (const name of was.names) if (now.get(name) !== was.typed[name]) types.push(`${table}: ${name} ${was.typed[name]} -> ${now.get(name) ?? "(gone)"}`);
    if (was.names.some(name => !now.has(name))) continue;
    const live = await proofRows(db, table, was.names, was.key);
    for (const [identity, bytes] of Object.entries(was.rows)) {
      if (!(identity in live)) rows.push(`${table} ${identity}: missing`);
      else if (live[identity] !== bytes) rows.push(`${table} ${identity}: changed`);
    }
  }
  return { rows, types };
}
async function rolledBack<T>(db: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();
  try { await client.query("BEGIN"); return await work(client); } finally { await client.query("ROLLBACK"); client.release(); }
}
it("[AC9] populated upgrade preserves every stored row, earlier routine and table shape; reapply is inert", async () => {
  const database = `stored_times_upgrade_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE ${database}`);
  const upgradeAdmin = new Pool(connectionOptions(database, "postgres")), upgradeRuntime = new Pool(connectionOptions(database, login));
  try {
    await upgradeAdmin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    for (const url of MIGRATION_URLS.filter(url => basename(fileURLToPath(url)) < migrationName)) {
      await upgradeAdmin.query(await readFile(url, "utf8"));
      await upgradeAdmin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [basename(fileURLToPath(url))]);
    }
    await seed(upgradeAdmin);
    const f = await fixture(upgradeAdmin, upgradeRuntime); await f.advance(); const c = await f.open();
    const review = await assertReview(f, c.id, "F18", true);
    const old = await rawCase(f, past);
    expect(old).toMatchObject({ pinned: false, kept_chosen: true });
    const before = await snapshot(upgradeAdmin);
    const functionCount = (await upgradeAdmin.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='app'::regnamespace")).rows[0]!.n;
    const triggerCount = (await upgradeAdmin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid=ANY($1::regclass[])", [tables.map(table => `app.${table}`)])).rows[0]!.n;
    const proof = await proofBefore(upgradeAdmin);
    for (const [table, was] of Object.entries(proof)) expect(Object.keys(was.rows).length, `${table} has a pre-existing row to compare`).toBeGreaterThan(0);
    // Migration 0127 ALONE, the way the runner applies one file: run its SQL, then record it in the registry.
    await upgradeAdmin.query(await readFile(MIGRATION_URLS.find(url => basename(fileURLToPath(url)) === migrationName)!, "utf8"));
    await upgradeAdmin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migrationName]);
    expect(await snapshot(upgradeAdmin)).toEqual(before);
    expect((await upgradeAdmin.query("SELECT count(*)::int n FROM pg_proc WHERE pronamespace='app'::regnamespace")).rows).toEqual([{ n: functionCount + 1 }]);
    expect((await upgradeAdmin.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid=ANY($1::regclass[])", [tables.map(table => `app.${table}`)])).rows).toEqual([{ n: triggerCount + 2 }]);
    expect((await upgradeAdmin.query("SELECT c.relname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgfoid=$1::regprocedure ORDER BY c.relname", [functionName])).rows).toEqual(tables.map(relname => ({ relname, tgenabled: "O" })));
    await migrate(upgradeAdmin); await migrate(upgradeAdmin);
    expect(await proofDifferences(upgradeAdmin, proof)).toEqual({ rows: [], types: [] });
    // Controls: each runs the SAME comparison inside a transaction that is rolled back.
    for (const table of tables) {
      // (a) a one-microsecond change to a stored time, made by a superuser UPDATE the way the merged tests seed times, must fail the row comparison.
      const moved = await rolledBack(upgradeAdmin, async client => {
        await client.query("SET LOCAL session_replication_role=replica");
        expect((await client.query(`UPDATE app.${table} SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1 AND job_id=$2`, [T, f.jobId])).rowCount).toBeGreaterThan(0);
        return proofDifferences(client, proof);
      });
      expect(moved.rows.some(line => line.startsWith(`${table} `)), `control (a) ${table}: ${JSON.stringify(moved)}`).toBe(true);
      expect(moved.types).toEqual([]);
    }
    // (b) a retype that keeps every serialised value must still fail the type comparison.
    const retyped = await rolledBack(upgradeAdmin, async client => {
      await client.query("ALTER TABLE app.recovery_claim_line ALTER COLUMN net_pence TYPE numeric(20,0)");
      return proofDifferences(client, proof);
    });
    expect(retyped).toEqual({ rows: [], types: ["recovery_claim_line: net_pence bigint -> numeric(20,0)"] });
    // (c) a later nullable column, and a later row in a compared table, must leave the proof passing.
    expect(await rolledBack(upgradeAdmin, async client => {
      await client.query("ALTER TABLE app.recovery_case ADD COLUMN stored_times_control text");
      expect((await proofColumns(client, "recovery_case")).map(column => column.name)).toContain("stored_times_control");
      return proofDifferences(client, proof);
    })).toEqual({ rows: [], types: [] });
    expect(await rolledBack(upgradeAdmin, async client => {
      expect((await client.query(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs)
        VALUES($1,$2,$3,$4,'GBP','identified',0,true,'withheld_customer_payment','Fictional debtor','builder_customer','customer_invoice',$5)`,
      [randomUUID(), T, f.jobId, receipt.grossPence, JSON.stringify(["Generated customer invoice INV-18800"])])).rowCount).toBe(1);
      return proofDifferences(client, proof);
    })).toEqual({ rows: [], types: [] });
    expect((await upgradeAdmin.query("SELECT created_at=$3::timestamptz kept_chosen FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [T, old.id, past])).rows).toEqual([{ kept_chosen: true }]);
    expect((await upgradeAdmin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [migrationName])).rows).toEqual([{ n: 1 }]);
    expect(await rawCase(f, future)).toMatchObject({ pinned: true, kept_chosen: false });
    expect(await rawAdvance(await fixture(upgradeAdmin, upgradeRuntime), past)).toMatchObject({ pinned: true, kept_chosen: false });
    expect((await f.cases.listForMember(ctx, f.jobId, actor)).find(row => row.id === c.id)?.eligibilityV3).toEqual(review);
  } finally {
    await closeTestPools(upgradeRuntime, upgradeAdmin);
    await admin.query(`DROP DATABASE ${database}`);
  }
}, 15_000);
it("[AC10] registry is sorted, unique and places the pin after its two dependencies", () => {
  const names = MIGRATION_URLS.map(url => basename(fileURLToPath(url)));
  expect(names).toEqual([...names].sort()); expect(new Set(names).size).toBe(names.length);
  expect(names.filter(name => name === migrationName)).toEqual([migrationName]);
  for (const dependency of ["0106_practice_feed.sql", "0119_recovery_eligibility_v3.sql"]) {
    expect(names.indexOf(dependency)).toBeGreaterThanOrEqual(0); expect(names.indexOf(migrationName)).toBeGreaterThan(names.indexOf(dependency));
  }
});
it("[AC11] contract and migration record retain the stated boundary and forward-fix instructions", async () => {
  const contract = await readFile(new URL("../../../docs/contracts/recovery-timing-pin-v1.md", import.meta.url), "utf8");
  const notes = await readFile(new URL("../MIGRATIONS.md", import.meta.url), "utf8");
  const residual = "After this pin a raw writer can still back-date by as long as it keeps its own transaction open, because the stored time is the transaction's start. That is bounded, needs raw database access, and is not closed by this order.";
  expect(contract).toContain(residual);
  for (const table of tables) expect(contract).toContain(`app.${table}`);
  expect(contract).toContain("privilege-only"); expect(contract).toContain("55000"); expect(contract).toContain("42501");
  const section = notes.slice(notes.indexOf("## 0127 — STORED-TIMES-1 recovery timing pin"));
  expect(section).toContain("short table lock"); expect(section).toContain("later reviewed migration"); expect(section).toContain("history");
});
