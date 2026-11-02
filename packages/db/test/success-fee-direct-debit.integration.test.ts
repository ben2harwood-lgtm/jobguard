// Real PostgreSQL + real MON-4A writers/sources; fake payment rail only.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { catchFeeFixture } from "./success-fee-catch-fixture.js";
import { rolledBack } from "./upgrade-proof-utils.js";
import { withTenant } from "../src/tenant-context.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
import { createSuccessFeeDirectDebitExecutor } from "../../../apps/api/src/fee-collection/success-fee-composition.js";
import { FakeGoCardlessRail } from "../../../apps/api/src/fee-collection/fake-gocardless.js";
import type { CollectionBook, ReservationStore } from "../../../apps/api/src/fee-collection/contracts.js";
import type { ActiveMembership } from "../../../apps/api/src/auth/auth-provider.js";
let f: FinalCheckFixture;
const environment = process.env.JOBGUARD_ENV;
beforeAll(async () => { f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => {
  if (f) await closeFinalCheckFixture(f);
  if (environment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = environment;
});
async function fixture() {
  const x = await catchFeeFixture(f);
  const command = (raw: unknown) => withTenant(f.runtime, x.context, async db =>
    (await db.$client.query("SELECT app.write_payment_fee($1,$2,$3::jsonb) result", [x.jobId, x.auth.digest, raw])).rows[0].result);
  const statement = await command({ version: "payment-fee-command.v1", action: "prepare", commandId: randomUUID(), paymentId: x.paymentId }) as { statementId: string; statementHash: string; feePence: number };
  const approval = { version: "payment-fee-command.v1", action: "approve", commandId: randomUUID(),
    statementId: statement.statementId, statementHash: statement.statementHash };
  await command(approval);
  const books = new Map<string, CollectionBook>(); let queue = Promise.resolve();
  // Reservation-store double only. Sources are never supplied by this double.
  const store: ReservationStore = { async transaction(tenantId, work) {
    const previous = queue; let unlock!: () => void; queue = new Promise(resolve => { unlock = resolve; });
    await previous;
    try {
      const copy = structuredClone(books.get(tenantId) ?? { attempts: [], events: {}, audit: [] });
      const unavailable = async (): Promise<never> => { throw new Error("STAND_IN_SOURCE_USED"); };
      const result = await work(copy, { collection: unavailable, credit: unavailable }); books.set(tenantId, copy); return result;
    } finally { unlock(); }
  } };
  // Database-authenticated practice session/membership bridge for the dark executor.
  const sessions = {
    async authenticate(token: string) {
      const row = (await f.runtime.query("SELECT * FROM app.authenticate_practice_session($1)", [token])).rows[0];
      return row ? { identityUserId: row.identity_user_id as string, sessionId: x.jobId, csrfToken: "synthetic-only" } : undefined;
    },
    async findMembership(principal: { identityUserId: string }, tenantId: string): Promise<ActiveMembership | undefined> {
      if (tenantId !== x.context.tenantId) return undefined;
      const row = await withTenant(f.runtime, x.context, async db => (await db.$client.query(
        "SELECT id,role FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())",
        [tenantId, x.actor.membershipId, principal.identityUserId])).rows[0]);
      return row ? { id: row.id, tenantId, identityUserId: principal.identityUserId, role: row.role, email: "synthetic@example.invalid" } : undefined;
    },
  };
  const rail = new FakeGoCardlessRail("synthetic-only-secret"), mandateId = randomUUID();
  rail.setup({ version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId: x.context.tenantId,
    commandId: randomUUID(), mandateId, approvedDecisionId: randomUUID(), noticeApproved: true, providerDefaultsDisabled: true });
  const mandate = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd",
    tenantId: x.context.tenantId, mandateId, eventId: randomUUID(), state: "active" }] });
  expect(rail.ingestMandates(mandate, rail.sign(mandate))).toEqual([{ code: "processed" }]);
  const compose = (ownerPool = f.admin) => createSuccessFeeDirectDebitExecutor({ ownerPool, context: x.context,
    digest: x.auth.digest, store, sessions, rails: [rail] });
  const executor = compose(), ctx = { tenantId: x.context.tenantId, environment: "synthetic_demo" as const, sessionToken: x.auth.digest };
  // MON-4A has no platform invoice; its statement ID is the reservation balance key,
  // never the builder's customer invoice identity.
  const collection = { version: "fee-collection.v1", commandId: randomUUID(), jobId: x.jobId, invoiceId: statement.statementId,
    statementHash: statement.statementHash, amountPence: statement.feePence, rail: "direct_debit", purpose: "receipt_success_fee" };
  return { ...x, command, statement, approval, store, rail, executor, compose, ctx, collection, book: () => structuredClone(books.get(x.context.tenantId) ?? { attempts: [], events: {}, audit: [] }) };
}
it("collects a real MON-4A approval once despite clicks/replays and preserves customer money", async () => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit");
  const customer = async () => (await f.admin.query("SELECT to_jsonb(p) value FROM app.customer_payment p WHERE tenant_id=$1 AND id=$2",
    [x.context.tenantId, x.paymentId])).rows[0].value;
  const before = await customer(); expect(x.statement.feePence).toBe(8000);
  const [a, b] = await Promise.all([x.executor.reserve(x.ctx, x.collection), x.executor.reserve(x.ctx, x.collection)]);
  expect(a).toEqual(b);
  const executions = await Promise.allSettled([x.executor.execute(x.ctx, x.collection.commandId), x.executor.execute(x.ctx, x.collection.commandId)]);
  expect(executions.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(submit).toHaveBeenCalledTimes(1);
  const body = JSON.stringify({ events: [{ version: "fake-dd-event.v1", environment: "synthetic_demo", account: "fake_jobguard_dd",
    tenantId: x.context.tenantId, eventId: randomUUID(), commandId: x.collection.commandId,
    objectId: x.rail.objectId(x.context.tenantId, x.collection.commandId), amountPence: 8000, kind: "collection", state: "paid_out" }] });
  await x.executor.directDebitWebhook(x.ctx, body, x.rail.sign(body));
  const settled = x.book(); await x.executor.directDebitWebhook(x.ctx, body, x.rail.sign(body));
  expect(x.book()).toEqual(settled); expect(x.book().attempts).toHaveLength(1); expect(x.book().attempts[0]?.state).toBe("settled");
  await x.command(x.approval); // Historical approval replay never creates another entitlement.
  await x.executor.reserve(x.ctx, x.collection);
  await expect(x.executor.reserve(x.ctx, { ...x.collection, commandId: randomUUID() })).rejects.toThrow("COLLECTION_REFUSED");
  expect(submit).toHaveBeenCalledTimes(1); expect(await customer()).toEqual(before);
});
it.each(["disputed", "approval_revoked"])("a real %s pauses a previously reserved collection", async state => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit"); await x.executor.reserve(x.ctx, x.collection);
  if (state === "disputed") await x.command({ version: "payment-fee-command.v1", action: "dispute", commandId: randomUUID(), statementId: x.statement.statementId });
  else await finalCheckTenant(f.admin, x.context.tenantId, db => db.query(
    "UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id IN(SELECT authorization_id FROM app.payment_fee_command WHERE tenant_id=$1 AND statement_id=$2)",
    [x.context.tenantId, x.statement.statementId]));
  await expect(x.executor.execute(x.ctx, x.collection.commandId)).rejects.toMatchObject({ reason: state === "disputed" ? "AUTHORITY_DISPUTED" : "AUTHORITY_REVOKED" });
  expect(submit).not.toHaveBeenCalled(); expect(x.book().attempts[0]?.state).toBe("reserved");
});
// Pins the reader to a rollback-only negative-control transaction, preserving
// withTenant's BEGIN/COMMIT/ROLLBACK contract as a nested savepoint.
function nestedPool(db: PoolClient): Pool {
  return { connect: async () => ({ release() {}, query: (sql: string, values?: unknown[]) => db.query(
    sql === "BEGIN" ? "SAVEPOINT mon4b_reader" : sql === "COMMIT" ? "RELEASE SAVEPOINT mon4b_reader"
      : sql === "ROLLBACK" ? "ROLLBACK TO SAVEPOINT mon4b_reader" : sql, values) }) } as unknown as Pool;
}
it("0359 approval_expired stops dispatch with AUTHORITY_EXPIRED", async () => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit"); await x.executor.reserve(x.ctx, x.collection);
  await rolledBack(f.admin, async db => {
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [x.context.tenantId]);
    // Match MON-4A's existing rollback-only expiry negative control; never weaken
    // a positive fixture or commit a changed authorization's immutable terms.
    await db.query("ALTER TABLE app.action_authorization DISABLE TRIGGER USER");
    await db.query("UPDATE app.action_authorization SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id IN(SELECT authorization_id FROM app.payment_fee_command WHERE tenant_id=$1 AND statement_id=$2)", [x.context.tenantId, x.statement.statementId]);
    await db.query("ALTER TABLE app.action_authorization ENABLE TRIGGER USER");
    await expect(x.compose(nestedPool(db)).execute(x.ctx, x.collection.commandId)).rejects.toMatchObject({ reason: "AUTHORITY_EXPIRED" });
  });
  expect(submit).not.toHaveBeenCalled(); expect(x.book().attempts[0]?.state).toBe("reserved");
  // Rollback restores the original valid real approval, which still dispatches.
  await x.executor.execute(x.ctx, x.collection.commandId); expect(submit).toHaveBeenCalledTimes(1);
});
it("refuses a foreign tenant's statement without a provider attempt", async () => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit");
  // Change only the querying tenant, retaining the actual approved statement ID.
  const foreignContext = (await import("./tenant-context-test-utils.js")).testTenantContext(randomUUID());
  const executor = createSuccessFeeDirectDebitExecutor({ ownerPool: f.admin, context: foreignContext,
    digest: x.auth.digest, store: x.store, rails: [x.rail], sessions: {
      authenticate: async () => ({ identityUserId: x.auth.identityUserId, sessionId: randomUUID(), csrfToken: "synthetic" }),
      findMembership: async () => ({ id: x.actor.membershipId, tenantId: foreignContext.tenantId,
        identityUserId: x.auth.identityUserId, role: "owner", email: "synthetic@example.invalid" }),
    } });
  // DB/session ownership must reject even a deliberately lying outer auth bridge.
  await expect(executor.reserve({ ...x.ctx, tenantId: foreignContext.tenantId }, x.collection)).rejects.toThrow();
  expect(x.book().attempts).toEqual([]); expect(submit).not.toHaveBeenCalled();
});

it("keeps MON-4A owner reads unavailable to the runtime connection", async () => {
  const x = await fixture();
  expect((await f.runtime.query("SELECT has_table_privilege(current_user,'app.payment_fee_statement','SELECT') allowed")).rows[0].allowed).toBe(false);
  await expect(x.compose(f.runtime).reserve(x.ctx, x.collection)).rejects.toThrow();
  expect(x.book().attempts).toEqual([]);
});

it("an unreviewed successor assessment stops an already reserved collection", async () => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit");
  await x.executor.reserve(x.ctx, x.collection);
  const a = x.assessment;
  await new RecoveryAttributionRepository(f.runtime).assess(x.context, x.jobId, x.auth.digest, {
    version: "recovery-attribution-command.v1", action: "assess", commandId: randomUUID(),
    caseId: a.caseId, workId: a.workId, lineId: a.lineId, lockId: a.lockId,
    expectedCaseRevision: a.caseRevision, expectedAttributionRevision: a.revision,
  });
  await expect(x.executor.execute(x.ctx, x.collection.commandId)).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
  expect(submit).not.toHaveBeenCalled(); expect(x.book().attempts[0]?.state).toBe("reserved");
});
it("changed source facts stop an approved collection before provider dispatch", async () => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit");
  await x.executor.reserve(x.ctx, x.collection);
  const preview = await x.invoices.previewCredit(x.context, { jobId: x.jobId, invoiceId: x.invoiceId,
    netPence: 40000, reason: "Fictional partial credit" });
  await x.invoices.issueCredit(x.context, { jobId: x.jobId, invoiceId: x.invoiceId,
    actorMembershipId: x.actor.membershipId, commandId: randomUUID(), netPence: 40000,
    reason: "Fictional partial credit", previewHash: preview.previewHash });
  await expect(x.executor.execute(x.ctx, x.collection.commandId)).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
  expect(submit).not.toHaveBeenCalled();
});
it("a forged statement hash cannot reserve collection", async () => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit");
  await expect(x.executor.reserve(x.ctx, { ...x.collection, statementHash: "0".repeat(64) }))
    .rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
  expect(x.book().attempts).toEqual([]); expect(submit).not.toHaveBeenCalled();
});

it.each(["expiry", "revocation"] as const)("rechecks %s after a real authorization row-lock wait", async kind => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit");
  await x.executor.reserve(x.ctx, x.collection);
  const params = [x.context.tenantId, x.statement.statementId];
  const authWhere = "tenant_id=$1 AND id IN(SELECT authorization_id FROM app.payment_fee_command WHERE tenant_id=$1 AND statement_id=$2 AND authorization_id IS NOT NULL)";
  const original = (await f.admin.query(`SELECT id,expires_at FROM app.action_authorization WHERE ${authWhere}`, params)).rows[0];
  const setExpiry = (value: Date) => finalCheckTenant(f.admin, x.context.tenantId, async db => {
    // Fixture-only immutable-term negative control, restored in finally.
    await db.query("ALTER TABLE app.action_authorization DISABLE TRIGGER USER");
    await db.query("UPDATE app.action_authorization SET expires_at=$3 WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, original.id, value]);
    await db.query("ALTER TABLE app.action_authorization ENABLE TRIGGER USER");
  });
  if (kind === "expiry") {
    const deadline = (await f.admin.query("SELECT clock_timestamp()+interval '10 seconds' deadline")).rows[0].deadline as Date;
    await setExpiry(deadline);
  }
  const blocker = await f.admin.connect();
  let signal!: (pid: number) => void;
  const started = new Promise<number>(resolve => { signal = resolve; });
  const waitingPool = { connect: async () => {
    const client = await f.admin.connect();
    const pid = (await client.query("SELECT pg_backend_pid() pid")).rows[0].pid as number;
    return { release: () => client.release(), query: (sql: string, values?: unknown[]) => {
      const result = client.query(sql, values);
      if (sql.includes("FOR SHARE OF a")) signal(pid);
      return result;
    } };
  } } as unknown as Pool;
  let dispatch: Promise<unknown> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query(`SELECT id FROM app.action_authorization WHERE ${authWhere} FOR UPDATE`, params);
    dispatch = x.compose(waitingPool).execute(x.ctx, x.collection.commandId);
    const rejected = expect(dispatch).rejects.toMatchObject({ reason: kind === "expiry" ? "AUTHORITY_EXPIRED" : "AUTHORITY_REVOKED" });
    const pid = await Promise.race([started, dispatch.then(() => { throw new Error("DISPATCH_DID_NOT_WAIT"); })]);
    let waiting = false;
    for (let n = 0; n < 200 && !waiting; n++) {
      await blocker.query("SELECT pg_stat_clear_snapshot()");
      waiting = (await blocker.query("SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.waiting === true;
      if (!waiting) await blocker.query("SELECT pg_sleep(0.01)");
    }
    expect(waiting).toBe(true);
    if (kind === "expiry") await blocker.query(`SELECT pg_sleep(greatest(0,extract(epoch FROM (expires_at-clock_timestamp())))+0.02) FROM app.action_authorization WHERE ${authWhere}`, params);
    else await blocker.query(`UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE ${authWhere}`, params);
    await blocker.query("COMMIT");
    await rejected;
    expect(submit).not.toHaveBeenCalled(); expect(x.book().attempts[0]?.state).toBe("reserved");
  } finally {
    await blocker.query("ROLLBACK"); blocker.release();
    await dispatch?.catch(() => undefined);
    if (kind === "expiry") await setExpiry(original.expires_at as Date);
  }
});

it.each(["revoked", "expired"] as const)("a %s attribution review stops previously approved dispatch", async state => {
  const x = await fixture(), submit = vi.spyOn(x.rail, "submit");
  await x.executor.reserve(x.ctx, x.collection);
  await rolledBack(f.admin, async db => {
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [x.context.tenantId]);
    await db.query("ALTER TABLE app.action_authorization DISABLE TRIGGER USER");
    await db.query(`UPDATE app.action_authorization SET ${state === "revoked" ? "revoked_at=clock_timestamp()" : "expires_at=clock_timestamp()-interval '1 second'"}
      WHERE tenant_id=$1 AND recipient=$2 AND action_type='recovery.attribution_review'`, [x.context.tenantId, x.assessment.assessmentId]);
    await db.query("ALTER TABLE app.action_authorization ENABLE TRIGGER USER");
    await expect(x.compose(nestedPool(db)).execute(x.ctx, x.collection.commandId)).rejects.toMatchObject({ reason: "AUTHORITY_STALE" });
  });
  expect(submit).not.toHaveBeenCalled();
  await x.executor.execute(x.ctx, x.collection.commandId); expect(submit).toHaveBeenCalledTimes(1);
});

it("0601 upgrades the latest writer in place, preserves approvals and is rerunnable", async () => {
  const x = await fixture();
  const previous = (await readFile(new URL("../migrations/0561_payment_fee_collect_review.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\n/u, "").replace(/COMMIT;\n$/u, "");
  const upgrade = (await readFile(new URL("../migrations/0601_payment_fee_collect_recheck.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\n/u, "").replace(/COMMIT;\n$/u, "");
  await rolledBack(f.admin, async db => {
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [x.context.tenantId]);
    await db.query(previous);
    const metadata = async () => (await db.query("SELECT oid,proowner,proacl FROM pg_proc WHERE oid='app.write_payment_fee(uuid,text,jsonb)'::regprocedure")).rows;
    const before = await metadata();
    await db.query(upgrade); await db.query(upgrade);
    expect(await metadata()).toEqual(before);
    expect((await db.query("SELECT document FROM app.payment_fee_statement WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.statement.statementId])).rows)
      .toEqual([{ document: x.statement }]);
    expect((await db.query("SELECT has_function_privilege('jobguard_runtime','app.payment_fee_review_deadline(uuid,uuid,jsonb,uuid)','EXECUTE') allowed")).rows)
      .toEqual([{ allowed: false }]);
    // Existing exact approval remains usable through the upgraded shared check.
    await x.compose(nestedPool(db)).reserve(x.ctx, x.collection);
  });
});
