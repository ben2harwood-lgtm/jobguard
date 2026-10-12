// Written first; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Client, Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RecoveryTransitionError } from "@jobguard/core";
import { migrate } from "../src/migrate.js";
import { RecoveryCaseRepository, type RecoveryCaseView } from "../src/recovery-case-repository.js";
import { appendAuditBatch, verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { withTenant, type TenantTransaction } from "../src/tenant-context.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenantA = randomUUID(), tenantB = randomUUID(), jobA = randomUUID(), jobB = randomUUID(), otherJobA = randomUUID();
const ctxA = testTenantContext(tenantA), ctxB = testTenantContext(tenantB);
const member = () => ({ membershipId: randomUUID(), identityUserId: randomUUID() });
const ownerA = member(), ownerB = member();
const login = "recovery_join_login", passphrase = randomUUID();
const oldEnvironment = process.env.JOBGUARD_ENV;
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, repo: RecoveryCaseRepository, directory: string, port: number;
const connectionOptions = (user: string) => ({ host: "127.0.0.1", port, database: "postgres", user, password: passphrase });
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  directory = await mkdtemp(join(tmpdir(), "jg-recovery-join-"));
  port = await freePort(62800, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: passphrase, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool(connectionOptions("postgres"));
  await migrate(admin);
  for (const [tenant, owner, job] of [[tenantA, ownerA, jobA], [tenantB, ownerB, jobB]] as const) {
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [owner.identityUserId]);
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Joined synthetic account')", [tenant, tenant]);
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$2,$3,'owner')", [owner.membershipId, tenant, owner.identityUserId]);
    await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Joined synthetic job')", [job, tenant]);
  }
  await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Another synthetic job')", [otherJobA, tenantA]);
  // The generated value is used only as an escaped SQL literal for this synthetic runtime login.
  await admin.query(`CREATE ROLE recovery_join_login LOGIN PASSWORD '${passphrase}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO recovery_join_login`);
  await admin.query("CREATE TABLE public.m4_8_s_pre_caller_fact(id uuid PRIMARY KEY, note text NOT NULL); GRANT SELECT,INSERT ON public.m4_8_s_pre_caller_fact TO recovery_join_login");
  runtime = new Pool(connectionOptions(login));
  repo = new RecoveryCaseRepository(runtime);
}, 40_000);
afterAll(async () => {
  if (oldEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = oldEnvironment;
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const landing = (view: RecoveryCaseView, amountPence = 1000, eventType = "record_landing") => ({
  version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId: view.id,
  expectedRevision: view.revision, eventType, amountPence,
});
async function ready(context = ctxA, jobId = jobA, actor = ownerA) {
  const opened = await repo.command(context, jobId, { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(),
    expectedRevision: 0, caseType: "withheld_customer_payment", claimedNetPence: 10000, counterparty: "Fictional debtor",
    book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"] }, actor);
  return repo.command(context, jobId, { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(),
    caseId: opened.id, expectedRevision: opened.revision, eventType: "assemble_evidence" }, actor);
}
const tx = (client: PoolClient): TenantTransaction => ({ $client: client }) as TenantTransaction;
async function begin(client: PoolClient, tenant = tenantA) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
}
async function callerFact(db: TenantTransaction, id: string) {
  await db.$client.query("INSERT INTO public.m4_8_s_pre_caller_fact(id,note) VALUES($1,'Synthetic caller row')", [id]);
}
async function joined(input: ReturnType<typeof landing>, factId = randomUUID()) {
  return withTenant(runtime, ctxA, async db => {
    await callerFact(db, factId);
    return repo.commandInTransaction(db, ctxA, jobA, input, ownerA);
  });
}
// Administrator queries use a second connection, never the open runtime client's snapshot.
async function counts(caseId: string, factId: string) {
  const rows = (await admin.query(`SELECT
    (SELECT count(*)::int FROM app.recovery_case_event WHERE case_id=$1 AND event_type IN('record_landing','reverse_landing')) events,
    (SELECT count(*)::int FROM app.audit_event WHERE subject_ref=$1::text AND event_type='recovery.transition') audits,
    (SELECT count(*)::int FROM public.m4_8_s_pre_caller_fact WHERE id=$2) facts`, [caseId, factId])).rows[0]!;
  return rows as { events: number; audits: number; facts: number };
}
async function current(caseId: string) {
  return (await admin.query("SELECT state,claim_pence,landed,manual_landed,written_off,revision FROM app.recovery_case_current WHERE id=$1", [caseId])).rows[0]!;
}
async function head() {
  return (await admin.query("SELECT sequence::text,event_hash FROM audit_control.audit_head WHERE tenant_id=$1", [tenantA])).rows;
}
async function verifyChain() {
  const rows = await admin.query(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",
    event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,
    trim(payload_hash) AS "payloadHash",trim(previous_hash) AS "previousHash",trim(event_hash) AS "eventHash"
    FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [tenantA]);
  verifyAuditChain(rows.rows as AuditEvent[]);
}
async function twinLanded(amount = 1000) {
  const twin = await ready();
  await repo.command(ctxA, jobA, landing(twin, amount), ownerA);
  return current(twin.id);
}
async function assertNoEffect(view: RecoveryCaseView, factId: string, before: Awaited<ReturnType<typeof counts>>, state: Awaited<ReturnType<typeof current>>) {
  expect(await counts(view.id, factId)).toEqual(before);
  expect(await current(view.id)).toEqual(state);
}
async function pid(client: PoolClient) { return Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid); }
async function waitForLock(where: string, values: unknown[]) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await admin.query(`SELECT pid,query,wait_event_type FROM pg_stat_activity WHERE ${where} AND wait_event_type='Lock'`, values);
    if (result.rowCount) return result.rows[0]!;
  }
  throw new Error("Expected PostgreSQL lock wait was not observed");
}

it("[U3] unjoined resolves after its event and audit commit and releases its clients", async () => {
  const view = await ready(), factId = randomUUID(), before = await counts(view.id, factId), twin = await twinLanded();
  await repo.command(ctxA, jobA, landing(view), ownerA);
  expect(await counts(view.id, factId)).toEqual({ events: before.events + 1, audits: before.audits + 1, facts: 0 });
  expect(await current(view.id)).toEqual(twin);
  expect(runtime.totalCount).toBe(runtime.idleCount);
});
it("[J1] caller commit saves its rows, the exact receipt and ordered audits together", async () => {
  const view = await ready(), factId = randomUUID(), input = landing(view), before = await counts(view.id, factId), twin = await twinLanded();
  await withTenant(runtime, ctxA, async db => {
    await callerFact(db, factId);
    expect(await repo.commandInTransaction(db, ctxA, jobA, input, ownerA)).toEqual({ caseId: view.id, replayed: false });
    await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${ownerA.membershipId}`,
      eventType: "caller.saved", subjectType: "caller_fact", subjectRef: factId, payload: { references: { commandId: input.commandId } } }]);
  });
  expect(await counts(view.id, factId)).toEqual({ events: before.events + 1, audits: before.audits + 1, facts: 1 });
  const event = (await admin.query("SELECT event_type,amount_pence,command_id,reviewer_ref,payload_hash FROM app.recovery_case_event WHERE command_id=$1", [input.commandId])).rows;
  expect(event).toEqual([{ event_type: "record_landing", amount_pence: String(input.amountPence), command_id: input.commandId,
    reviewer_ref: `membership:${ownerA.membershipId}`, payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/u) }]);
  const audits = (await admin.query("SELECT sequence::int,event_type,subject_ref FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 2", [tenantA])).rows.reverse();
  expect(audits.map(a => [a.event_type, a.subject_ref])).toEqual([["recovery.transition", view.id], ["caller.saved", factId]]);
  expect(audits[1].sequence).toBe(audits[0].sequence + 1);
  await verifyChain();
  expect(await current(view.id)).toEqual(twin);
});
it("[J2] open joined transaction exposes nothing early and caller rollback leaves no receipt", async () => {
  const view = await ready(), factId = randomUUID(), input = landing(view), before = await counts(view.id, factId), state = await current(view.id), auditHead = await head();
  const client = await runtime.connect();
  try {
    await begin(client); await callerFact(tx(client), factId);
    await repo.commandInTransaction(tx(client), ctxA, jobA, input, ownerA);
    await assertNoEffect(view, factId, before, state);
    expect(await head()).toEqual(auditHead);
    await client.query("ROLLBACK");
    await assertNoEffect(view, factId, before, state);
    expect(await head()).toEqual(auditHead);
    expect((await client.query("SELECT 1 AS alive")).rows).toEqual([{ alive: 1 }]);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
it("[J3] caller exception rolls everything back and the same command then succeeds", async () => {
  const view = await ready(), factId = randomUUID(), input = landing(view), before = await counts(view.id, factId), state = await current(view.id), error = new Error("Caller abort");
  await expect(withTenant(runtime, ctxA, async db => {
    await callerFact(db, factId); await repo.commandInTransaction(db, ctxA, jobA, input, ownerA); throw error;
  })).rejects.toBe(error);
  await assertNoEffect(view, factId, before, state);
  await expect(joined(input, factId)).resolves.toEqual({ caseId: view.id, replayed: false });
  expect(await counts(view.id, factId)).toEqual({ events: before.events + 1, audits: before.audits + 1, facts: 1 });
});
it("[J4] stale revision and excess landing refuse with merged errors and roll caller rows back", async () => {
  for (const kind of ["stale", "excess"] as const) {
    const view = await ready(), factId = randomUUID(), before = await counts(view.id, factId), state = await current(view.id);
    const input = kind === "stale" ? { ...landing(view), expectedRevision: view.revision + 1 } : landing(view, view.claimedNetPence + 1);
    const result = joined(input, factId);
    if (kind === "stale") await expect(result).rejects.toThrow("RECOVERY_STALE_REVISION");
    else await expect(result).rejects.toBeInstanceOf(RecoveryTransitionError);
    await assertNoEffect(view, factId, before, state);
  }
});
it("[J5] lock timeout is PostgreSQL's same error and only caller rollback ends the failed transaction", async () => {
  const view = await ready(), factId = randomUUID(), before = await counts(view.id, factId), state = await current(view.id);
  const blocker = await admin.connect(), client = await runtime.connect();
  let databaseError: unknown;
  try {
    await blocker.query("SELECT pg_advisory_lock(hashtext($1),hashtext($2))", [tenantA, view.id]);
    await begin(client); await client.query("SET LOCAL lock_timeout = '50ms'"); await callerFact(tx(client), factId);
    // Observe the actual driver rejection before the repository receives it.
    const query = async (sql: string, values?: unknown[]) => {
      try { return await client.query(sql, values); } catch (error) { databaseError = error; throw error; }
    };
    const db = { $client: { query } } as unknown as TenantTransaction;
    let thrown: unknown;
    try { await repo.commandInTransaction(db, ctxA, jobA, landing(view), ownerA); } catch (error) { thrown = error; }
    expect(thrown).toBe(databaseError); expect(thrown).toMatchObject({ code: "55P03" });
    await client.query("ROLLBACK");
    expect((await client.query("SELECT 1 AS alive")).rows).toEqual([{ alive: 1 }]);
    await assertNoEffect(view, factId, before, state);
  } finally {
    await client.query("ROLLBACK"); client.release();
    await blocker.query("SELECT pg_advisory_unlock(hashtext($1),hashtext($2))", [tenantA, view.id]); blocker.release();
  }
});
it("[J6] mismatched tenant proofs and foreign reviewer fail without rows in either tenant", async () => {
  const view = await ready();
  const totals = () => admin.query("SELECT tenant_id,count(*)::int AS n FROM app.recovery_case_event GROUP BY tenant_id ORDER BY tenant_id");
  const auditTotals = () => admin.query("SELECT tenant_id,count(*)::int AS n FROM app.audit_event GROUP BY tenant_id ORDER BY tenant_id");
  const before = (await totals()).rows, audits = (await auditTotals()).rows;
  for (const [opened, supplied, code] of [[ctxA, ctxB, "RECOVERY_JOIN_TENANT_MISMATCH"],
    [ctxB, ctxA, "RECOVERY_JOIN_TENANT_MISMATCH"], [ctxB, ctxB, "RECOVERY_REVIEWER_FORBIDDEN"]] as const) {
    const factId = randomUUID();
    await expect(withTenant(runtime, opened, async db => {
      await callerFact(db, factId); await repo.commandInTransaction(db, supplied, jobA, landing(view), ownerA);
    })).rejects.toMatchObject({ code });
    expect((await totals()).rows).toEqual(before); expect((await auditTotals()).rows).toEqual(audits);
    expect((await counts(view.id, factId)).facts).toBe(0);
  }
});
it("[J6d] PostgreSQL refuses hand-made foreign-tenant event and audit inserts", async () => {
  const foreign = await ready(ctxB, jobB, ownerB);
  // Catalog checks in merged tenancy tests do not exercise these two actual INSERT boundaries.
  await expect(withTenant(runtime, ctxA, db => db.$client.query(`INSERT INTO app.recovery_case_event
    (id,tenant_id,job_id,case_id,sequence,event_type,from_state,to_state,amount_pence,reviewer_ref,command_id,payload_hash)
    VALUES($1,$2,$3,$4,3,'record_landing','evidence_assembled','partially_landed',1000,$5,$6,$7)`,
  [randomUUID(), tenantB, jobB, foreign.id, `membership:${ownerB.membershipId}`, randomUUID(), "a".repeat(64)]))).rejects.toMatchObject({ code: "42501" });
  await expect(withTenant(runtime, ctxA, db => db.$client.query(`INSERT INTO app.audit_event
    (id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,event_hash)
    VALUES($1,$2,999,'audit.v1',$3,'caller.saved','recovery_case',$4,clock_timestamp(),'{}',$5,$5)`,
  [randomUUID(), tenantB, `membership:${ownerB.membershipId}`, foreign.id, "b".repeat(64)]))).rejects.toMatchObject({ code: "42501" });
});
it("[J7] a dedicated client outside BEGIN is refused even with session tenant state", async () => {
  const view = await ready(), factId = randomUUID(), before = await counts(view.id, factId), state = await current(view.id);
  const client = new Client(connectionOptions(login)); await client.connect();
  try {
    const db = { $client: client } as unknown as TenantTransaction;
    await expect(repo.commandInTransaction(db, ctxA, jobA, landing(view), ownerA)).rejects.toMatchObject({ code: "RECOVERY_JOIN_TRANSACTION_REQUIRED" });
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantA]);
    await expect(repo.commandInTransaction(db, ctxA, jobA, landing(view), ownerA)).rejects.toMatchObject({ code: "RECOVERY_JOIN_TRANSACTION_REQUIRED" });
    await assertNoEffect(view, factId, before, state);
  } finally { await client.end(); }
});
it("[J8] current owner authorization is rechecked and held FOR SHARE until caller ends", async () => {
  const view = await ready();
  for (const kind of ["non-owner", "revoked", "expired", "wrong-identity"] as const) {
    const actor = member(), identity = kind === "wrong-identity" ? randomUUID() : actor.identityUserId;
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [identity]);
    await admin.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at,expires_at)
      VALUES($1,$2,$2,$3,$4,$5,$6)`, [actor.membershipId, tenantA, identity, kind === "non-owner" ? "member" : "owner",
      kind === "revoked" ? "2000-01-01T00:00:00Z" : null, kind === "expired" ? "2000-01-01T00:00:00Z" : null]);
    const factId = randomUUID(), before = await counts(view.id, factId), state = await current(view.id);
    await expect(withTenant(runtime, ctxA, async db => {
      await callerFact(db, factId); await repo.commandInTransaction(db, ctxA, jobA, landing(view), actor);
    })).rejects.toMatchObject({ code: "RECOVERY_REVIEWER_FORBIDDEN" });
    await assertNoEffect(view, factId, before, state);
  }
  const heldOwner = member();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [heldOwner.identityUserId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$2,$3,'owner')", [heldOwner.membershipId, tenantA, heldOwner.identityUserId]);
  const client = await runtime.connect(), updater = await admin.connect(), updaterPid = await pid(updater);
  let update: Promise<unknown> | undefined;
  try {
    await begin(client); await callerFact(tx(client), randomUUID());
    await repo.commandInTransaction(tx(client), ctxA, jobA, landing(view), heldOwner);
    let completed = false;
    update = updater.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenantA, heldOwner.membershipId]).then(result => { completed = true; return result; });
    const waiting = await waitForLock("pid=$1", [updaterPid]);
    expect(waiting.query).toContain("UPDATE app.membership"); expect(completed).toBe(false);
    await client.query("COMMIT"); await update; expect(completed).toBe(true);
  } finally { await client.query("ROLLBACK"); client.release(); await update; updater.release(); }
});
it("[J9] joined and unjoined share receipts, replay hashes and conflict behavior", async () => {
  const a = await ready(), inputA = landing(a), factA = randomUUID();
  await joined(inputA, factA); const committedA = await counts(a.id, factA);
  // (i) joined -> joined; (ii) joined -> unjoined also proves acceptance of the stored hash.
  await expect(withTenant(runtime, ctxA, db => repo.commandInTransaction(db, ctxA, jobA, inputA, ownerA))).resolves.toEqual({ caseId: a.id, replayed: true });
  expect(await counts(a.id, factA)).toEqual(committedA);
  const replayedView = await repo.command(ctxA, jobA, inputA, ownerA);
  expect(replayedView.id).toBe(a.id); expect(replayedView.landedNetPence).toBe(inputA.amountPence);
  expect(await counts(a.id, factA)).toEqual(committedA);
  // (iii) unjoined -> joined.
  const b = await ready(), inputB = landing(b), factB = randomUUID();
  await repo.command(ctxA, jobA, inputB, ownerA); const committedB = await counts(b.id, factB);
  await expect(withTenant(runtime, ctxA, db => repo.commandInTransaction(db, ctxA, jobA, inputB, ownerA))).resolves.toEqual({ caseId: b.id, replayed: true });
  expect(await counts(b.id, factB)).toEqual(committedB);
  for (const [view, input, factId, committed] of [[a, inputA, factA, committedA], [b, inputB, factB, committedB]] as const) {
    // (iv) changed amount, both modes; (v) unchanged body but another job, both modes.
    for (const [jobId, body] of [[jobA, { ...input, amountPence: input.amountPence + 1 }], [otherJobA, input]] as const) {
      await expect(repo.command(ctxA, jobId, body, ownerA)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
      await expect(withTenant(runtime, ctxA, db => repo.commandInTransaction(db, ctxA, jobId, body, ownerA))).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
      expect(await counts(view.id, factId)).toEqual(committed);
    }
  }
  await verifyChain();
});
it.each(["commit-stale", "rollback-success", "unjoined-stale", "same-command"] as const)(
  "[J10] observed case lock contention: %s", async mode => {
    const view = await ready(), twin = await twinLanded(), inputX = landing(view), inputY = mode === "same-command" ? inputX : landing(view);
    const factX = randomUUID(), factY = randomUUID(), before = await counts(view.id, factX);
    const x = await runtime.connect(), y = mode === "unjoined-stale" ? undefined : await runtime.connect();
    const zName = `jg_join_z_${randomUUID()}`, zPool = mode === "unjoined-stale" ? new Pool({ ...connectionOptions(login), application_name: zName }) : undefined;
    let pending: Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }> | undefined;
    try {
      const yPid = y ? await pid(y) : undefined;
      await begin(x); await callerFact(tx(x), factX);
      await repo.commandInTransaction(tx(x), ctxA, jobA, inputX, ownerA);
      if (y) { await begin(y); await callerFact(tx(y), factY); }
      const work = y ? repo.commandInTransaction(tx(y), ctxA, jobA, inputY, ownerA)
        : new RecoveryCaseRepository(zPool!).command(ctxA, jobA, inputY, ownerA);
      // Attach both handlers immediately: a stale failure cannot become an unhandled rejection.
      pending = work.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
      const waiting = await waitForLock(y ? "pid=$1" : "application_name=$1", [y ? yPid : zName]);
      expect(waiting.query).toContain("pg_advisory_xact_lock");
      await x.query(mode === "rollback-success" ? "ROLLBACK" : "COMMIT");
      const result = await pending;
      if (mode === "commit-stale" || mode === "unjoined-stale") {
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("Stale command succeeded");
        expect(result.error).toMatchObject({ message: "RECOVERY_STALE_REVISION" });
        if (y) await y.query("ROLLBACK");
      } else {
        expect(result).toEqual({ ok: true, value: { caseId: view.id, replayed: mode === "same-command" } });
        await y!.query("COMMIT");
      }
      expect(await counts(view.id, mode === "rollback-success" ? factY : factX))
        .toEqual({ events: before.events + 1, audits: before.audits + 1, facts: 1 });
      const events = (await admin.query("SELECT command_id,amount_pence FROM app.recovery_case_event WHERE case_id=$1 AND event_type='record_landing'", [view.id])).rows;
      expect(events).toEqual([{ command_id: mode === "rollback-success" ? inputY.commandId : inputX.commandId, amount_pence: String(inputX.amountPence) }]);
      expect(await current(view.id)).toEqual(twin); await verifyChain();
    } finally {
      await x.query("ROLLBACK"); x.release();
      await pending;
      if (y) { await y.query("ROLLBACK"); y.release(); }
      await zPool?.end();
    }
  });
it("[J11] joined reverse landing matches unjoined twin and caller rollback preserves landed", async () => {
  let view = await ready(), twin = await ready();
  view = await repo.command(ctxA, jobA, landing(view, 5000), ownerA);
  twin = await repo.command(ctxA, jobA, landing(twin, 5000), ownerA);
  await repo.command(ctxA, jobA, landing(twin, 1000, "reverse_landing"), ownerA);
  const before = await current(view.id);
  await joined(landing(view, 1000, "reverse_landing"));
  const after = await current(view.id);
  expect(Number(before.landed) - Number(after.landed)).toBe(1000);
  expect(after).toEqual(await current(twin.id));
  view = (await repo.listForMember(ctxA, jobA, ownerA)).find(item => item.id === view.id)!;
  const factId = randomUUID(), countsBefore = await counts(view.id, factId), error = new Error("Rollback reverse");
  await expect(withTenant(runtime, ctxA, async db => {
    await callerFact(db, factId); await repo.commandInTransaction(db, ctxA, jobA, landing(view, 500, "reverse_landing"), ownerA); throw error;
  })).rejects.toBe(error);
  await assertNoEffect(view, factId, countsBefore, after); await verifyChain();
});
