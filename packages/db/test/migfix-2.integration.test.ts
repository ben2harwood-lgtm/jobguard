import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditBatch, DisabledQualifyingLandingPostingPort, LedgerRepository, migrate, withTenant } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
const hash = "a".repeat(64);
type Fixture = { tenant: string; member: string; book: string; receivable: string; income: string; clearing: string };
type Action = "plan_obligation" | "plan_settlement" | "correction";
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-migfix-2-"));
  const port = await freePort(57000, 200), loginValue = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: loginValue,
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"] });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: loginValue, database: "postgres" });
  await migrate(admin); await migrate(admin);
  const ddl = await admin.query("SELECT format('CREATE ROLE migfix_2_login LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', $1::text) AS ddl", [loginValue]);
  await admin.query(ddl.rows[0].ddl);
  await admin.query("GRANT jobguard_runtime TO migfix_2_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "migfix_2_login", password: loginValue,
    database: "postgres", application_name: "migfix-2-runtime", max: 3 });
}, 120_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

async function fixture(): Promise<Fixture> {
  const f = { tenant: randomUUID(), member: randomUUID(), book: randomUUID(), receivable: randomUUID(), income: randomUUID(), clearing: randomUUID() };
  const user = randomUUID();
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [f.tenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic')", [user, f.tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$3,'owner')", [f.member, f.tenant, user]);
  await admin.query("INSERT INTO app.ledger_book(id,tenant_id,code,currency,chart_status) VALUES($1,$2,'synthetic','GBP','synthetic')", [f.book, f.tenant]);
  for (const [id, classification] of [[f.receivable, "receivable"], [f.income, "deferred_income"], [f.clearing, "provider_clearing"]]) {
    await admin.query("INSERT INTO app.ledger_account(id,tenant_id,book_id,currency,code,class,mapping_status) VALUES($1,$2,$3,'GBP',$4,$4,'synthetic')", [id, f.tenant, f.book, classification]);
  }
  return f;
}
async function authorization(f: Fixture, action: Action, amount: number) {
  const id = randomUUID();
  await admin.query("INSERT INTO app.financial_authorization(id,tenant_id,membership_id,purpose,amount_pence,currency,artifact_hash,status) VALUES($1,$2,$3,$4,$5,'GBP',$6,'approved')", [id, f.tenant, f.member, action, amount, hash]);
  return id;
}
// Exercise the installed SQL directly as the non-owner runtime login. The matching
// audit is appended only after all business locks; failures roll back both effects.
async function post(f: Fixture, action: Action, amount: number, original?: string,
  options: { income?: string; clearing?: string; receivable?: string; book?: string; auth?: string; beforeCommit?: () => Promise<void> } = {}) {
  const auth = options.auth ?? await authorization(f, action, amount);
  const journal = randomUUID(), audit = randomUUID();
  return withTenant(runtime, testTenantContext(f.tenant), async d => {
    await d.$client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'");
    if (action === "plan_obligation") {
      await d.$client.query("SELECT app.post_plan_obligation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [journal, options.book ?? f.book, options.receivable ?? f.receivable, options.income ?? f.income, amount, "GBP", journal, "synthetic_authorized_plan", "synthetic", hash, auth, audit]);
    } else if (action === "plan_settlement") {
      await d.$client.query("SELECT app.post_plan_settlement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [journal, options.book ?? f.book, original, options.clearing ?? f.clearing, options.receivable ?? f.receivable, amount, "GBP", journal, "synthetic", hash, auth, audit]);
    } else {
      await d.$client.query("SELECT app.reverse_journal($1,$2,$3,$4,$5,$6,$7,$8)",
        [journal, options.book ?? f.book, original, journal, "synthetic", hash, auth, audit]);
    }
    await options.beforeCommit?.();
    await appendAuditBatch(d, [{ id: audit, version: "audit.v1", actorRef: `membership:${f.member}`,
      eventType: "financial.journal_posted", subjectType: "journal", subjectRef: journal,
      payload: { hashes: { artifact: hash }, classifications: { record: "financial" } } }]);
    return journal;
  });
}
async function balances(f: Fixture) {
  return withTenant(runtime, testTenantContext(f.tenant), async d => {
    const rows = (await d.$client.query("SELECT account_id,balance_pence::text FROM app.ledger_balance WHERE book_id=$1", [f.book])).rows;
    return Object.fromEntries(rows.map(row => [row.account_id, Number(row.balance_pence)]));
  });
}
async function effects(f: Fixture) {
  return (await admin.query("SELECT (SELECT count(*)::int FROM app.journal WHERE tenant_id=$1) journals,(SELECT count(*)::int FROM app.journal_line WHERE tenant_id=$1) lines,(SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits", [f.tenant])).rows[0];
}
async function waitForLocks(count: number) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const row = (await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='migfix-2-runtime' AND wait_event_type='Lock'")).rows[0];
    if (row.n >= count) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("controlled ledger lock barrier was not reached");
}
async function race(f: Fixture, original: string, calls: Array<() => Promise<string>>) {
  const blocker = await admin.connect();
  let running: Promise<PromiseSettledResult<string>[]> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM app.journal WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [f.tenant, original]);
    running = Promise.allSettled(calls.map(call => call()));
    await waitForLocks(calls.length);
    await blocker.query("COMMIT");
    return await running;
  } finally {
    await blocker.query("ROLLBACK"); blocker.release();
    await running;
  }
}

describe("MIGFIX-2 controlled ledger corrections", () => {
  it("[MIGFIX-2-1] allows only one full reversal of a journal", async () => {
    const f = await fixture(), obligation = await post(f, "plan_obligation", 1000);
    const results = await race(f, obligation, [() => post(f, "correction", 1000, obligation), () => post(f, "correction", 1000, obligation)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: "23505" }) })]);
    expect(await balances(f)).toEqual({ [f.receivable]: 0, [f.income]: 0 });
    const before = await effects(f);
    await expect(post(f, "correction", 1000, obligation)).rejects.toMatchObject({ code: "23505" });
    expect(await effects(f)).toEqual(before);
    expect(before).toEqual({ journals: 2, lines: 4, audits: 2 });
  });

  it("[MIGFIX-2-2] accepts replacement payment after settlement reversal", async () => {
    const f = await fixture(), obligation = await post(f, "plan_obligation", 1000);
    expect(await balances(f)).toEqual({ [f.receivable]: 1000, [f.income]: -1000 });
    const settlement = await post(f, "plan_settlement", 400, obligation);
    expect(await balances(f)).toEqual({ [f.receivable]: 600, [f.income]: -1000, [f.clearing]: 400 });
    await post(f, "correction", 400, settlement);
    expect(await balances(f)).toEqual({ [f.receivable]: 1000, [f.income]: -1000, [f.clearing]: 0 });
    await post(f, "plan_settlement", 1000, obligation);
    expect(await balances(f)).toEqual({ [f.receivable]: 0, [f.income]: -1000, [f.clearing]: 1000 });
    const before = await effects(f);
    await expect(post(f, "plan_settlement", 1, obligation)).rejects.toMatchObject({ code: "23514" });
    expect(await effects(f)).toEqual(before);
  });

  it("[MIGFIX-2-3] refuses settlement of a fully reversed obligation", async () => {
    const f = await fixture(), obligation = await post(f, "plan_obligation", 1000);
    await post(f, "correction", 1000, obligation);
    const before = await effects(f);
    await expect(post(f, "plan_settlement", 1000, obligation)).rejects.toMatchObject({ code: "23514" });
    expect(await balances(f)).toEqual({ [f.receivable]: 0, [f.income]: 0 });
    expect(await effects(f)).toEqual(before);
  });

  it("[MIGFIX-2-4] rejects identical obligation accounts", async () => {
    const f = await fixture(), before = await effects(f);
    await expect(post(f, "plan_obligation", 1000, undefined, { income: f.receivable })).rejects.toMatchObject({ code: "23514" });
    expect(await effects(f)).toEqual(before);
    await expect(post(f, "plan_obligation", 1000, undefined, { income: f.clearing })).rejects.toMatchObject({ code: "23514" });
    await expect(post(f, "plan_obligation", 1000, undefined, { receivable: f.income, income: f.receivable })).rejects.toMatchObject({ code: "23514" });
    expect(await effects(f)).toEqual(before);
    await post(f, "plan_obligation", 1000);
    expect(await balances(f)).toEqual({ [f.receivable]: 1000, [f.income]: -1000 });
  });

  it("[MIGFIX-2-5] races settlement and reversal under the obligation lock without overpayment or deadlock", async () => {
    // Hold the first operation before its audit/commit, then prove the other is blocked.
    // Both orders must serialize, including correction of a settlement, not just an obligation.
    for (const firstAction of ["plan_settlement", "correction"] as const) {
      const f = await fixture(), obligation = await post(f, "plan_obligation", 1000);
      let release!: () => void, reached!: () => void;
      const hold = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<void>(resolve => { reached = resolve; });
      const first = post(f, firstAction, 1000, obligation, { beforeCommit: async () => { reached(); await hold; } });
      // Attach a rejection handler immediately; the assertions below retain its result.
      const firstResult = Promise.allSettled([first]);
      let secondResult: Promise<PromiseSettledResult<string>[]> | undefined;
      try {
        await Promise.race([ready, first.then(() => { throw new Error("barrier missed"); })]);
        secondResult = Promise.allSettled([post(f, firstAction === "correction" ? "plan_settlement" : "correction", 1000, obligation)]);
        await waitForLocks(1);
      } finally { release(); await firstResult; }
      expect((await firstResult)[0]!.status).toBe("fulfilled");
      expect(await secondResult).toEqual([expect.objectContaining({ status: "rejected", reason: expect.objectContaining({ code: "23514" }) })]);
      expect(await balances(f)).toEqual(firstAction === "correction" ? { [f.receivable]: 0, [f.income]: 0 }
        : { [f.receivable]: 0, [f.income]: -1000, [f.clearing]: 1000 });
    }
    const f = await fixture(), obligation = await post(f, "plan_obligation", 1000);
    const settlement = await post(f, "plan_settlement", 400, obligation);
    const results = await race(f, obligation, [() => post(f, "correction", 400, settlement), () => post(f, "plan_settlement", 1000, obligation)]);
    expect(results[0]!.status).toBe("fulfilled");
    const payment = results[1]!;
    if (payment.status === "rejected") {
      expect(payment.reason).toMatchObject({ code: "23514" });
      await post(f, "plan_settlement", 1000, obligation);
    }
    expect(await balances(f)).toEqual({ [f.receivable]: 0, [f.income]: -1000, [f.clearing]: 1000 });
  }, 30_000);

  it("[MIGFIX-2-AUTH] preserves exact authorization, tenant isolation and classified same-book accounts", async () => {
    const f = await fixture(), foreign = await fixture(), before = await effects(f);
    await expect(post(f, "plan_obligation", 1000, undefined, { income: foreign.income })).rejects.toMatchObject({ code: "23514" });
    await expect(post(f, "plan_obligation", 1000, undefined, { book: foreign.book })).rejects.toMatchObject({ code: "23514" });
    for (const mutation of ["status='revoked'", "status='expired'", "expires_at=clock_timestamp()-interval '1 second'", "purpose='correction'", "amount_pence=999", "artifact_hash=repeat('b',64)"]) {
      const auth = await authorization(f, "plan_obligation", 1000);
      await admin.query(`UPDATE app.financial_authorization SET ${mutation} WHERE tenant_id=$1 AND id=$2`, [f.tenant, auth]);
      await expect(post(f, "plan_obligation", 1000, undefined, { auth })).rejects.toMatchObject({ code: "42501" });
    }
    for (const mutation of ["role='foreman'", "role='admin'", "revoked_at=clock_timestamp()", "expires_at=clock_timestamp()-interval '1 second'"]) {
      await admin.query("UPDATE app.membership SET role='owner',revoked_at=NULL,expires_at=NULL WHERE tenant_id=$1 AND id=$2", [f.tenant, f.member]);
      await admin.query(`UPDATE app.membership SET ${mutation} WHERE tenant_id=$1 AND id=$2`, [f.tenant, f.member]);
      await expect(post(f, "plan_obligation", 1000)).rejects.toMatchObject({ code: "42501" });
    }
    expect(await effects(f)).toEqual(before);
    await admin.query("UPDATE app.membership SET role='finance',revoked_at=NULL,expires_at=NULL WHERE tenant_id=$1 AND id=$2", [f.tenant, f.member]);
    await post(f, "plan_obligation", 1000);
    expect(await balances(f)).toEqual({ [f.receivable]: 1000, [f.income]: -1000 });
  });

  it("[MIGFIX-2-CATALOG] preserves controlled grants, FORCE RLS, owners, search paths and deferred balance/audit constraints", async () => {
    for (const table of ["ledger_book", "ledger_account", "financial_authorization", "journal", "journal_line"]) {
      const row = (await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner,has_table_privilege('jobguard_runtime',oid,'SELECT') readable,has_table_privilege('jobguard_runtime',oid,'INSERT,UPDATE,DELETE,TRUNCATE') writable FROM pg_class WHERE oid=$1::regclass", [`app.${table}`])).rows[0];
      expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", readable: true, writable: false });
    }
    const routines = (await admin.query("SELECT p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') executable,EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname=ANY($1::text[])", [["post_plan_obligation", "post_plan_settlement", "reverse_journal"]])).rows;
    expect(routines).toHaveLength(3);
    for (const routine of routines) expect(routine).toMatchObject({ prosecdef: true, proconfig: ["search_path=pg_catalog, app"], owner: "jobguard_migration", executable: true, public_execute: false });
    const constraints = (await admin.query("SELECT tgname,tgdeferrable,tginitdeferred FROM pg_trigger WHERE tgname IN('journal_balanced','journal_line_balanced') ORDER BY tgname")).rows;
    expect(constraints).toEqual(["journal_balanced", "journal_line_balanced"].map(tgname => ({ tgname, tgdeferrable: true, tginitdeferred: true })));
    const reversalKey = (await admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.journal'::regclass AND conname='journal_full_reversal_uq' AND contype='u'")).rows;
    expect(reversalKey).toEqual([{ definition: "UNIQUE (tenant_id, reverses_journal_id)" }]);
    const f = await fixture();
    await expect(withTenant(runtime, testTenantContext(f.tenant), d => d.$client.query("INSERT INTO app.journal DEFAULT VALUES"))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(runtime, testTenantContext(f.tenant), d => d.$client.query("SELECT app.post_recovery_fee_candidate('{}')"))).rejects.toMatchObject({ code: "0A000" });
    await expect(new DisabledQualifyingLandingPostingPort().postQualifyingLanding()).rejects.toMatchObject({ code: "RECOVERY_FEE_POSTING_DISABLED" });
    // Repository still uses the same callable contract.
    const auth = await authorization(f, "plan_obligation", 1000);
    await new LedgerRepository(runtime).postPlanObligation(testTenantContext(f.tenant), { authorizationId: auth, actorRef: `membership:${f.member}`, permission: "finance:approve" },
      { schemaVersion: 1, bookId: f.book, amountPence: 1000, currency: "GBP", sourceEventId: randomUUID(), provenanceRef: "synthetic", artifactHash: hash,
        authorizationId: auth, actorRef: `membership:${f.member}`, receivableAccountId: f.receivable, deferredIncomeAccountId: f.income, provenanceKind: "synthetic_authorized_plan" });
    expect(await balances(f)).toEqual({ [f.receivable]: 1000, [f.income]: -1000 });
    const before = await effects(f), missingAuditAuth = await authorization(f, "plan_obligation", 1000);
    const priorAudit = (await admin.query("SELECT audit_event_id FROM app.journal WHERE tenant_id=$1", [f.tenant])).rows[0].audit_event_id;
    await expect(withTenant(runtime, testTenantContext(f.tenant), d => d.$client.query(
      "SELECT app.post_plan_obligation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [randomUUID(), f.book, f.receivable, f.income, 1000, "GBP", randomUUID(), "synthetic_authorized_plan", "synthetic", hash, missingAuditAuth, priorAudit],
    ))).rejects.toMatchObject({ code: "23514" });
    expect(await effects(f)).toEqual(before);
  });
});
