import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subscriptionPlanView } from "@jobguard/core";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { SubscriptionPersistenceError, SubscriptionRepository } from "../src/subscription-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { calendarInput, command, count, historicalAgreement, meterCompany, readSubscription, storeMeter, terms, type SubscriptionCompany } from "./subscription-persistence-fixtures.js";
import { snapshotRows } from "./upgrade-proof-utils.js";
import { lp11EmptyTables } from "./later-empty-tables.js";
import { discardDraftRegistryRow, invoiceSendRegistryRow } from "./lp5-command-catalog.js";

const stem = "0755_subscription_pending_downgrade";
const migration = readFileSync(new URL(`../migrations/${stem}.sql`, import.meta.url), "utf8");
const guard = `   IF EXISTS(SELECT 1 FROM app.subscription_plan_change c WHERE c.tenant_id=t
    AND NOT EXISTS(SELECT 1 FROM app.subscription_change_outcome o WHERE o.tenant_id=c.tenant_id AND o.change_id=c.id)) THEN
    RAISE EXCEPTION 'SUBSCRIPTION_PENDING_CHANGE' USING ERRCODE='23514';
   END IF;
`;
const pendingConflict = { message: "SUBSCRIPTION_PENDING_CHANGE", code: "23514" };
const downgrade = (a: SubscriptionCompany) => ({ ...terms(a, "Solo", 1), kind: "change" });
async function prepared(f: WorkFixture) {
 const a = await meterCompany(f); await historicalAgreement(f, a);
 return { a, value: downgrade(a) };
}
async function refuseWithoutWrites(f: WorkFixture, a: SubscriptionCompany, value: Record<string, unknown>, error: Record<string, unknown>, id = randomUUID()) {
 const before = await snapshotRows(f.admin);
 await expect(command(f, a, value, id)).rejects.toMatchObject(error);
 expect(await snapshotRows(f.admin)).toEqual({ ...before, "control_plane.worker_action_binding": [] });
}

it("replaces only the locked downgrade guard; keeps the entire 0746 authority, replay and apply-change body", () => {
 const predecessor = readFileSync(new URL("../migrations/0746_subscription_internal_owner_guard.sql", import.meta.url), "utf8");
 expect(migration.split(guard)).toHaveLength(2);
 expect(migration.replace(guard, "").slice(migration.indexOf("BEGIN;"))).toBe(predecessor.slice(predecessor.indexOf("BEGIN;")));
 expect(migration.indexOf(guard)).toBeGreaterThan(migration.indexOf("RETURN prior.result;"));
 expect(JSON.parse(readFileSync(new URL(`./migration-proofs/${stem}.proof.json`, import.meta.url), "utf8"))).toEqual({ migration: `${stem}.sql`, lp0: [], upgrade: [], tenancy: [] });
});

describe.sequential("LS-162 pending subscription downgrade (real PostgreSQL)", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("two concurrent fresh requests create exactly one pending change, approval, receipt and audit; original replay is exact", async () => {
  const { a, value } = await prepared(f), ids = [randomUUID(), randomUUID()];
  const before = await Promise.all(["subscription_plan_change", "action_authorization", "command_receipt", "audit_event"].map(t => count(f, a, t)));
  const results = await Promise.allSettled(ids.map(id => command(f, a, value, id)));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toEqual([expect.objectContaining({ reason: expect.objectContaining(pendingConflict) })]);
  const winner = results.findIndex(r => r.status === "fulfilled");
  const saved = results[winner]; if (saved?.status !== "fulfilled") throw new Error("missing winner");
  const snapshot = await snapshotRows(f.admin);
  expect(await command(f, a, value, ids[winner]!)).toEqual(saved.value);
  expect(await snapshotRows(f.admin)).toEqual(snapshot);
  const after = await Promise.all(["subscription_plan_change", "action_authorization", "command_receipt", "audit_event"].map(t => count(f, a, t)));
  expect(after).toEqual(before.map(n => n + 1));
  await refuseWithoutWrites(f, a, value, pendingConflict);
  const read = await readSubscription(f, a);
  expect(subscriptionPlanView(read, "2026-11-15").pendingDowngrade).toMatchObject({ changeId: saved.value.changeId, effectiveDate: saved.value.effectiveDate });
  await refuseWithoutWrites(f, a, { ...value, expectedRevision: 99 }, { message: "COMMAND_CONFLICT" }, ids[winner]);
  await refuseWithoutWrites(f, a, { ...value, expectedRevision: 99 }, { message: "SUBSCRIPTION_STALE_REVISION" });
  await refuseWithoutWrites(f, a, { ...value, contentHash: "0".repeat(64) }, { message: "SUBSCRIPTION_CONTENT_MISMATCH" });
  await expect(new SubscriptionRepository(f.runtime).command(testTenantContext(a.tenantId, { membershipId: a.actorId, bindRequest: false }), a.digest, randomUUID(), value)).rejects.toEqual(new SubscriptionPersistenceError("SUBSCRIPTION_PENDING_CHANGE"));
 });
 it.each(["admin", "revoked"])("%s owner cannot replay or create a request", async state => {
  const { a, value } = await prepared(f), id = randomUUID(); await command(f, a, value, id);
  await f.admin.query(`UPDATE app.membership SET ${state === "admin" ? "role='admin'" : "revoked_at=clock_timestamp()"} WHERE tenant_id=$1 AND id=$2`, [a.tenantId, a.actorId]);
  for (const key of [id, randomUUID()]) await refuseWithoutWrites(f, a, value, { code: "42501" }, key);
 });
 it("foreign pending rows do not block another tenant; foreign sources cannot complete a change", async () => {
  const { a, value } = await prepared(f), { a: b } = await prepared(f);
  const first = await command(f, a, value);
  expect(await command(f, b, downgrade(b))).toMatchObject({ status: "pending" });
  const sourceId = await storeMeter(f, b, calendarInput(b.tenantId, 5, 9));
  await refuseWithoutWrites(f, a, { version: "subscription-command.v1", kind: "apply_change", changeId: first.changeId, sourceId, expectedRevision: 1 }, { code: "42501" });
  await refuseWithoutWrites(f, b, { version: "subscription-command.v1", kind: "apply_change", changeId: first.changeId, sourceId, expectedRevision: 1 }, { code: "42501" });
 });
 it.each([5, 6])("recorded apply_change outcome at capacity %i clears pending and permits the next normal request", async capacity => {
  const { a, value } = await prepared(f), originalId = randomUUID(), first = await command(f, a, value, originalId);
  const sourceId = await storeMeter(f, a, calendarInput(a.tenantId, capacity, 9));
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1 AND id=$2", [a.tenantId, first.changeId]);
  }, { membershipId: a.actorId });
  expect(await command(f, a, { version: "subscription-command.v1", kind: "apply_change", changeId: first.changeId, sourceId, expectedRevision: 1 })).toMatchObject({ outcome: capacity === 5 ? "applied" : "refused_capacity" });
  expect(subscriptionPlanView(await readSubscription(f, a), "2026-11-15").pendingDowngrade).toBeNull();
  const next = capacity === 5 ? { ...terms(a, "Builder", 2), kind: "change" } : value;
  expect(await command(f, a, next)).toMatchObject(capacity === 5 ? { revision: 3 } : { status: "pending" });
  expect(await command(f, a, value, originalId)).toEqual(first);
 });
});

describe("0753 populated upgrade (real PostgreSQL)", () => {
 let f: WorkFixture, runtime: Pool | undefined;
 beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
 afterAll(async () => { await runtime?.end(); await closeWorkFixture(f); });
 it("preserves historical duplicate pending rows, approvals, outcomes and replay while blocking any further request", async () => {
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(`${stem}.sql`)); expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
   await f.admin.query(readFileSync(url, "utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const login = `ls162_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_runtime TO ${login}`);
  runtime = new Pool({ ...f.admin.options, user: login, password, max: 2 });
  const fixture = { ...f, runtime }, { a, value } = await prepared(fixture), id = randomUUID();
  const first = await command(fixture, a, value, id); await command(fixture, a, value);
  // Also preserve a completed historical request in a separate tenant.
  const { a: b, value: bv } = await prepared(fixture), completed = await command(fixture, b, bv);
  const sourceId = await storeMeter(fixture, b, calendarInput(b.tenantId, 6, 9));
  await workTenant(f.admin, b.tenantId, async db => { await db.query("SET LOCAL session_replication_role='replica'"); await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1", [b.tenantId]); }, { membershipId: b.actorId });
  await command(fixture, b, { version: "subscription-command.v1", kind: "apply_change", changeId: completed.changeId, sourceId, expectedRevision: 1 });
  const metadata = async () => (await f.admin.query("SELECT proowner,proacl::text,prosecdef,proconfig,proargtypes::text,prorettype FROM pg_proc WHERE oid='app.mon2_command(uuid,text,uuid,jsonb)'::regprocedure")).rows;
  const { a: c, value: cv } = await prepared(fixture), singleId = randomUUID();
  const single = await command(fixture, c, cv, singleId);
  const security = await metadata(), before = await snapshotRows(f.admin);
  await migrate(f.admin); await migrate(f.admin);
  expect(await snapshotRows(f.admin)).toEqual({ ...before, ...lp11EmptyTables, "control_plane.worker_action_binding": [], "app.command_type_registry": (await f.admin.query("SELECT jsonb_agg(value ORDER BY value::text) data FROM jsonb_array_elements($1::jsonb)", [JSON.stringify([...(before["app.command_type_registry"] as unknown[]), discardDraftRegistryRow, invoiceSendRegistryRow])])).rows[0].data }); expect(await metadata()).toEqual(security);
  expect(await command(fixture, a, value, id)).toEqual(first);
  expect(await command(fixture, c, cv, singleId)).toEqual(single);
  expect(subscriptionPlanView(await readSubscription(fixture, c), "2026-11-15").pendingDowngrade).toMatchObject({ changeId: single.changeId, effectiveDate: single.effectiveDate });
  await refuseWithoutWrites(fixture, c, cv, pendingConflict);
  await refuseWithoutWrites(fixture, a, value, pendingConflict);
  const read = await readSubscription(fixture, a);
  expect(() => subscriptionPlanView(read, "2026-11-15")).toThrow("INVALID_SUBSCRIPTION_INPUT");
  expect(await command(fixture, b, bv)).toMatchObject({ status: "pending" });
 }, 120000);
});
