import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subscriptionAgreementHash } from "@jobguard/core";
import { DarkFeeCollectionExecutor } from "../../../apps/api/src/fee-collection/executor.js";
import { FakeGoCardlessRail } from "../../../apps/api/src/fee-collection/fake-gocardless.js";
import { PostgresReservationStore } from "../../../apps/api/src/fee-collection/postgres-reservation-store.js";
import { ctx, fixture, id } from "../../../apps/api/src/fee-collection/test-fixture.js";
import type { CollectionBook, SignedProviderResult } from "../../../apps/api/src/fee-collection/contracts.js";
import { withTenant } from "../src/tenant-context.js";
import { migrate } from "../src/migrate.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { proofSchema } from "./migration-proof-loader.js";

const sql = readFileSync(new URL("../migrations/0744_fee_webhook_receipt_binding.sql", import.meta.url), "utf8");
const predecessor = readFileSync(new URL("../migrations/0708_fee_result_json_errors.sql", import.meta.url), "utf8");
const bodyOnly = (value: string) => value.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
const proof = proofSchema.parse(JSON.parse(readFileSync(new URL("./migration-proofs/0744_fee_webhook_receipt_binding.proof.json", import.meta.url), "utf8")));
const replace = "SELECT app.replace_fee_reservation_book($1,$2::jsonb,$3::jsonb)";
const values = (tenant: string, book: CollectionBook, result?: SignedProviderResult) =>
  [tenant, JSON.stringify({ version: "fee-reservation-book.v1", ...book }), JSON.stringify(result ?? null)];

describe("LATER-SAFETY-148 exact synthetic webhook receipts (real PostgreSQL)", () => {
  let db: WorkFixture;
  beforeAll(async () => { db = await createWorkFixture(); }, 120_000);
  afterAll(async () => closeWorkFixture(db));

  async function setup(railName: "stripe_card" | "direct_debit") {
    const f = fixture(), tenantId = randomUUID(), context = { ...ctx, tenantId };
    await db.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
    f.source.tenantId = f.source.agreement.tenantId = tenantId;
    f.source.agreement.record!.selection.tenantId = tenantId;
    const terms = subscriptionAgreementHash(f.source.agreement.record!.selection);
    f.source.agreement.currentTermsHash = f.source.agreement.record!.termsHash = terms;
    f.source.agreement.record!.approval.termsHash = terms;
    f.source.agreement.statementApproval!.tenantId = tenantId;
    f.source.agreement.statementApproval!.termsHash = terms;
    const dd = new FakeGoCardlessRail("fake-dd-test-signing-secret");
    const rail = railName === "stripe_card" ? f.rail : dd;
    await db.admin.query("INSERT INTO app.fee_provider_fixture_key VALUES($1,'stripe_card',$2),($1,'direct_debit',$3)",
      [tenantId, "synthetic-test-signing-secret", "fake-dd-test-signing-secret"]);
    if (railName === "direct_debit") {
      dd.setup({ version: "fake-dd-setup.v1", environment: "synthetic_demo", tenantId,
        commandId: id(80), mandateId: id(81), approvedDecisionId: id(82), noticeApproved: true, providerDefaultsDisabled: true });
      const body = JSON.stringify({ events: [{ version: "fake-dd-mandate-event.v1", environment: "synthetic_demo",
        account: "fake_jobguard_dd", tenantId, mandateId: id(81), eventId: id(83), state: "active" }] });
      dd.ingestMandates(body, dd.sign(body));
    }
    const store = (pool = db.runtime) => new PostgresReservationStore(pool, testTenantContext(tenantId),
      () => ({ collection: async () => f.source, credit: async () => ({ ...f.credit, tenantId }) }));
    const executor = (pool = db.runtime) => new DarkFeeCollectionExecutor(store(pool), [rail],
      () => new Date("2026-10-29T00:00:00Z"), { ...f.sessions, findMembership: async () => ({ ...f.membership, tenantId }) });
    const read = () => store().transaction(tenantId, async book => structuredClone(book));
    const snapshot = async () => ({
      book: (await db.admin.query("SELECT * FROM app.fee_reservation_book WHERE tenant_id=$1", [tenantId])).rows,
      archive: (await db.admin.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key", [tenantId])).rows,
      audit: (await db.admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [tenantId])).rows,
    });
    const event = (eventId: string, state: string) => ({ version: railName === "stripe_card" ? "fake-stripe-event.v1" : "fake-dd-event.v1",
      environment: "synthetic_demo", account: railName === "stripe_card" ? "fake_jobguard_card" : "fake_jobguard_dd",
      tenantId, eventId, commandId: id(10), objectId: rail.objectId(tenantId, id(10)), amountPence: 600, kind: "collection", state });
    const send = (event: unknown, pool = db.runtime) => {
      const body = JSON.stringify(railName === "stripe_card" ? event : { events: [event] });
      return executor(pool).webhook(context, railName, body, rail.sign(body));
    };
    await executor().reserve(context, { ...f.intent, rail: railName });
    await executor().execute(context, id(10)); // v1 state-only submit is still accepted.
    return { tenantId, rail, read, snapshot, event, send, executor, context, store };
  }

  it.each(["stripe_card", "direct_debit"] as const)("refuses captured and substituted receipts atomically for %s", async railName => {
    const f = await setup(railName), before = await f.read();
    const binding = { key: `${railName}:${id(91)}`, hash: "a".repeat(64) };
    const next = { ...before, events: { ...before.events, [binding.key]: binding.hash } };
    const attempt = before.attempts[0]!;
    const signed = f.rail.signStoreResult(f.tenantId, attempt, binding);
    const unchanged = await f.snapshot();
    const attacks: [CollectionBook, SignedProviderResult][] = [
      [next, f.rail.signStoreResult(f.tenantId, attempt)], // captured state-only v1
      [{ ...next, events: { [`${railName}:${id(92)}`]: binding.hash } }, signed],
      [{ ...next, events: { [binding.key]: "b".repeat(64) } }, signed],
      [{ ...next, events: { ...next.events, [`${railName}:${id(92)}`]: binding.hash } }, signed],
      [next, f.rail.signStoreResult(id(99), attempt, binding)],
      [next, f.rail.signStoreResult(f.tenantId, { ...attempt, commandId: id(99) }, binding)],
      [next, f.rail.signStoreResult(f.tenantId, { ...attempt, rail: railName === "stripe_card" ? "direct_debit" : "stripe_card" }, binding)],
      [{ ...next, events: { [`${railName === "stripe_card" ? "direct_debit" : "stripe_card"}:${id(91)}`]: binding.hash } }, signed],
    ];
    for (const [book, result] of attacks) {
      await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(replace, values(f.tenantId, book, result))))
        .rejects.toMatchObject({ code: "23514" });
      expect(await f.snapshot()).toEqual(unchanged);
    }
    // Even a correctly bound event must roll back with its surrounding transaction.
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), async tx => {
      await tx.$client.query(replace, values(f.tenantId, next, signed));
      throw new Error("receipt-rollback");
    })).rejects.toThrow("receipt-rollback");
    expect(await f.snapshot()).toEqual(unchanged);
    await withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(replace, values(f.tenantId, next, signed)));
    const recorded = await f.snapshot();
    const later = await f.read();
    later.events[`${railName}:${id(92)}`] = binding.hash;
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(replace, values(f.tenantId, later, signed))))
      .rejects.toMatchObject({ code: "23514" });
    expect(await f.snapshot()).toEqual(recorded);
  });

  it.each(["stripe_card", "direct_debit"] as const)("commits exact %s events once across compaction/restart, including no-ops and late contradictions", async railName => {
    const f = await setup(railName);
    const states = railName === "stripe_card" ? ["settled", "settled", "definite_failure", "definite_failure"]
      : ["submitted", "confirmed", "paid_out", "paid_out", "late_failure", "late_failure"];
    for (const [i, state] of states.entries()) {
      const event = f.event(id(100 + i), state);
      await f.send(event);
      const current = await f.snapshot();
      // Every routine call compacts events into the immutable archive.
      expect(current.book[0]!.book.events).toEqual({});
      expect(current.archive.filter(r => r.kind === "event")).toHaveLength(i + 1);
      expect(current.audit.filter(r => r.event_type === "fee.collection.webhook_recorded")).toHaveLength(i + 1);
      const restarted = new Pool(db.runtime.options);
      try { await f.send(event, restarted); } finally { await restarted.end(); }
      expect(await f.snapshot()).toEqual(current);
      const changed = { ...event, amountPence: 601 };
      if (railName === "stripe_card") await expect(f.send(changed)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      else expect(await f.send(changed)).toEqual([{ code: "IDEMPOTENCY_CONFLICT" }]);
      expect(await f.snapshot()).toEqual(current);
    }
    expect((await f.read()).attempts[0]!.state).toBe("reconciliation_required");
  });

  it.each(["stripe_card", "direct_debit"] as const)("proves the predecessor gap and preserves populated %s history/authority on upgrade and replay", async railName => {
    const f = await setup(railName);
    const settled = railName === "stripe_card" ? "settled" : "paid_out";
    await f.send(f.event(id(90), settled));
    await db.admin.query(predecessor);
    const prior = await f.read();
    const legacy = { ...prior, events: { ...prior.events, [`${railName}:${id(89)}`]: "c".repeat(64) } };
    await withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(replace,
      values(f.tenantId, legacy, f.rail.signStoreResult(f.tenantId, prior.attempts[0]!))));
    const book = await f.read(), unchanged = await f.snapshot();
    const next = { ...book, events: { ...book.events, [`${railName}:${id(91)}`]: "a".repeat(64) } };
    const captured = f.rail.signStoreResult(f.tenantId, book.attempts[0]!);
    const client = await db.admin.connect();
    try {
      await client.query("BEGIN");
      await client.query(bodyOnly(predecessor));
      await client.query("SET LOCAL ROLE jobguard_runtime");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenantId]);
      // Failing-first witness: 0708 accepts a captured v1 receipt for an unrelated key.
      await client.query(replace, values(f.tenantId, next, captured));
    } finally { await client.query("ROLLBACK"); client.release(); }
    expect(await f.snapshot()).toEqual(unchanged);
    const routine = async () => (await db.admin.query(`SELECT n.nspname,p.proname,pg_get_function_arguments(p.oid) args,
      pg_get_userbyid(p.proowner) proowner,p.proacl::text,p.prosecdef,p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.oid='app.replace_fee_reservation_book(uuid,jsonb,jsonb)'::regprocedure`)).rows[0];
    const authority = await routine();
    for (const change of proof.upgrade) if (change.section === "routines") expect(authority).toEqual(change.before);
    await db.admin.query(sql); // populated forward upgrade; no historical fact is reinterpreted
    await db.admin.query(sql); // replacement itself is replay-safe
    await migrate(db.admin); // recorded migration replay also preserves facts
    expect(await f.snapshot()).toEqual(unchanged);
    expect(await routine()).toEqual(authority);
    for (const change of proof.tenancy) {
      const posture = (await db.admin.query(`SELECT relrowsecurity,relforcerowsecurity,
        pg_get_userbyid(relowner) owner, EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid
          AND p.polcmd='*' AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) guarded
        FROM pg_class c WHERE oid=$1::regclass`, [`app.${change.relname}`])).rows[0];
      expect(posture).toEqual(change.after);
    }
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(replace, values(f.tenantId, next, captured))))
      .rejects.toMatchObject({ code: "23514" });
    await expect(withTenant(db.runtime, testTenantContext(id(99)), tx => tx.$client.query(replace, values(f.tenantId, next, captured))))
      .rejects.toMatchObject({ code: "42501" });
    await expect(db.runtime.query(replace, values(f.tenantId, next, captured))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query("SELECT * FROM app.fee_provider_fixture_key")))
      .rejects.toMatchObject({ code: "42501" });
    expect((await db.admin.query(`SELECT
      has_function_privilege('jobguard_runtime','app.replace_fee_reservation_book(uuid,jsonb,jsonb)','EXECUTE') runtime,
      has_function_privilege('jobguard_infrastructure','app.replace_fee_reservation_book(uuid,jsonb,jsonb)','EXECUTE') infrastructure,
      has_table_privilege('jobguard_runtime','app.fee_reservation_archive','INSERT') archive_insert`)).rows[0])
      .toEqual({ runtime: true, infrastructure: false, archive_insert: false });
    await withTenant(db.runtime, testTenantContext(id(99)), async tx => {
      expect((await tx.$client.query("SELECT * FROM app.fee_reservation_book WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([]);
      expect((await tx.$client.query("SELECT * FROM app.fee_reservation_archive WHERE tenant_id=$1", [f.tenantId])).rows).toEqual([]);
    });
    expect(await f.snapshot()).toEqual(unchanged);
    await f.send(f.event(id(92), settled)); // own matching receipt after upgrade
  });

  it("kills a focused mutation removing the exact key/hash comparison", async () => {
    const f = await setup("stripe_card"), book = await f.read();
    const binding = { key: `stripe_card:${id(91)}`, hash: "a".repeat(64) };
    const signed = f.rail.signStoreResult(f.tenantId, book.attempts[0]!, binding);
    const forged = { ...book, events: { [binding.key]: "b".repeat(64) } };
    const unchanged = await f.snapshot();
    const mutant = bodyOnly(sql).replace("jsonb_build_object('key',v_event.key,'hash',v_event.value #>> '{}')", "v_proof->'event'");
    expect(mutant).not.toBe(bodyOnly(sql));
    const client = await db.admin.connect();
    try {
      await client.query("BEGIN");
      await client.query(mutant);
      await client.query("SET LOCAL ROLE jobguard_runtime");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenantId]);
      // This exact regression assertion fails against the mutant (the forged write succeeds).
      await expect(expect(client.query(replace, values(f.tenantId, forged, signed))).rejects.toMatchObject({ code: "23514" }))
        .rejects.toThrow();
    } finally { await client.query("ROLLBACK"); client.release(); }
    expect(await f.snapshot()).toEqual(unchanged);
    await expect(withTenant(db.runtime, testTenantContext(f.tenantId), tx => tx.$client.query(replace, values(f.tenantId, forged, signed))))
      .rejects.toMatchObject({ code: "23514" });
  });
});
