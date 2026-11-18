import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { approvedSimulation, calendarInput, command, count, historicalAgreement, meterCompany, meterInput, readSubscription, storeMeter, terms, type SubscriptionCompany } from "./subscription-persistence-fixtures.js";
import { rolledBack, snapshotRows } from "./upgrade-proof-utils.js";

const stem = "0746_subscription_internal_owner_guard";
const signature = "app.mon2_command(uuid,text,uuid,jsonb)";
const migration = readFileSync(new URL(`../migrations/${stem}.sql`, import.meta.url), "utf8");
const oldGuard = " IF kind IN('accept','change','approve_simulation') AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;\n";
const guard = oldGuard.replace("'approve_simulation')", "'approve_simulation','issue','apply_change','record_simulation','reconcile_simulation')");
const kinds = ["issue", "apply_change", "record_simulation", "reconcile_simulation"] as const;
type Kind = typeof kinds[number];
const forbidden = { message: "SUBSCRIPTION_FORBIDDEN", code: "42501" };
const role = (f: WorkFixture, a: SubscriptionCompany, value: string) => f.admin.query("UPDATE app.membership SET role=$3 WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId, value]);
const definition = async (f: WorkFixture) => (await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition as string;

// Valid prerequisites are shared by refusal, positive control, upgrade and mutation tests.
async function prepared(f: WorkFixture, kind: Kind) {
 if (kind === "issue" || kind === "apply_change") {
  const a = await meterCompany(f); await historicalAgreement(f, a);
  if (kind === "issue") {
   await storeMeter(f, a, meterInput(a.tenantId));
   return { a, value: { version: "subscription-command.v1", kind, periodStart: "2026-09-01", expectedRevision: 1 }, table: "subscription_period", expected: { kind } };
  }
  const changed = await command(f, a, { ...terms(a, "Solo", 1), kind: "change" });
  const sourceId = await storeMeter(f, a, calendarInput(a.tenantId, 5, 9));
  // Historical synthetic boundary, using the established admin-only fixture pattern.
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1 AND id=$2", [a.tenantId, changed.changeId]);
  }, { membershipId: a.actorId });
  return { a: await meterCompany(f, a.tenantId), value: { version: "subscription-command.v1", kind, changeId: changed.changeId, sourceId, expectedRevision: 1 }, table: "subscription_change_outcome", expected: { kind, outcome: "applied", revision: 2 } };
 }
 const { a, approved } = await approvedSimulation(f);
 await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 });
 if (kind === "reconcile_simulation") await command(f, a, { version: "subscription-command.v1", kind: "record_simulation", workId: approved.workId, resultId: randomUUID(), outcome: "outcome_unknown", expectedRevision: 1 });
 // Keep the approving owner active when the separate executor is downgraded.
 return { a: await meterCompany(f, a.tenantId), value: { version: "subscription-command.v1", kind, workId: approved.workId, resultId: randomUUID(), outcome: "settled", expectedRevision: 1 }, table: "subscription_simulated_result", expected: { kind, outcome: "settled", settled: true } };
}

async function refusesWithoutWrites(f: WorkFixture, a: SubscriptionCompany, value: Record<string, unknown>, id = randomUUID()) {
 const before = await snapshotRows(f.admin);
 await expect(command(f, a, value, id)).rejects.toMatchObject(forbidden);
 expect(await snapshotRows(f.admin)).toEqual(before);
}

it("changes only the owner guard and moves it after locked actor resolution, before receipt replay", () => {
 const predecessor = readFileSync(new URL("../migrations/0374_subscription_first_period_safety.sql", import.meta.url), "utf8");
 const original = predecessor.slice(predecessor.indexOf("CREATE OR REPLACE FUNCTION app.mon2_command"), predecessor.indexOf("\n\n\nCREATE OR REPLACE FUNCTION app.mon2_issue"));
 const replacement = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"), migration.indexOf("\nCOMMIT;"));
 expect(replacement.split(guard)).toHaveLength(2);
 expect(replacement.replace(guard, "")).toBe(original.replace(oldGuard, ""));
 expect(replacement.indexOf(guard)).toBeGreaterThan(replacement.lastIndexOf("actor:=app.mon1_company_actor(t,digest);"));
 expect(replacement.indexOf(guard)).toBeLessThan(replacement.indexOf("SELECT * INTO prior"));
 // No metadata, grant, static-call/write-set or RLS delta: explicit empty proof sections.
 expect(JSON.parse(readFileSync(new URL(`./migration-proofs/${stem}.proof.json`, import.meta.url), "utf8"))).toEqual({ migration: `${stem}.sql`, lp0: [], upgrade: [], tenancy: [] });
});

describe.sequential("LATER-SAFETY-149 internal subscription authority (real PostgreSQL)", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it.each(kinds)("admin %s is refused; owner succeeds once, conflicts on changed payload and cannot replay after downgrade", async kind => {
  const { a, value, table, expected } = await prepared(f, kind), id = randomUUID();
  await role(f, a, "admin");
  expect((await readSubscription(f, a)).agreements).toHaveLength(1);
  await refusesWithoutWrites(f, a, value, id);
  await role(f, a, "owner");
  const effects = await count(f, a, table), audits = await count(f, a, "audit_event");
  const first = await command(f, a, value, id);
  expect(first).toMatchObject(expected);
  const after = await snapshotRows(f.admin);
  expect(await command(f, a, value, id)).toEqual(first);
  expect(await snapshotRows(f.admin)).toEqual(after);
  expect(await count(f, a, table)).toBe(effects + 1);
  expect(await count(f, a, "audit_event")).toBe(audits + 1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId, id])).rows).toEqual([{ n: 1 }]);
  await expect(command(f, a, { ...value, expectedRevision: 999 }, id)).rejects.toMatchObject({ message: "COMMAND_CONFLICT", code: "22023" });
  expect(await snapshotRows(f.admin)).toEqual(after);
  await role(f, a, "admin");
  await refusesWithoutWrites(f, a, value, id);
  expect((await readSubscription(f, a)).agreements.length).toBeGreaterThan(0);
 });
 it("existing owner-only accept also rechecks authority before replay", async () => {
  const a = await meterCompany(f), value = terms(a), id = randomUUID();
  await command(f, a, value, id); await role(f, a, "admin");
  await refusesWithoutWrites(f, a, value, id);
 });
 it("admin retains review, onboarding and execute_simulation", async () => {
  const { a: approver, approved } = await approvedSimulation(f);
  const a = await meterCompany(f, approver.tenantId);
  const sourceId = await storeMeter(f, a, calendarInput(a.tenantId, 14, 10));
  await role(f, a, "admin");
  expect(await command(f, a, { version: "subscription-command.v1", kind: "review", sourceId, expectedRevision: 1 })).toMatchObject({ kind: "review", trackReviewDue: true });
  expect(await command(f, a, { version: "subscription-command.v1", kind: "onboarding", usualPlaces: 3, siteStaffLogExtras: false })).toMatchObject({ recommendedTrack: "small_builder" });
  expect(await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 })).toMatchObject({ workId: approved.workId });
 });
 it.each(["membership revoked", "membership expired", "session revoked", "session expired"])("%s refuses fresh and stored commands without writes", async invalid => {
  const { a, value } = await prepared(f, "record_simulation"), id = randomUUID();
  await command(f, a, value, id);
  if (invalid.startsWith("membership")) await f.admin.query(`UPDATE app.membership SET ${invalid.endsWith("revoked") ? "revoked_at" : "expires_at"}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`, [a.tenantId, a.actorId]);
  else await f.admin.query(`UPDATE identity.session SET ${invalid.endsWith("revoked") ? "revoked_at" : "expires_at"}=clock_timestamp()-interval '1 second' WHERE id=$1`, [a.sessionId]);
  const before = await snapshotRows(f.admin);
  for (const commandId of [id, randomUUID()]) await expect(command(f, a, value, commandId)).rejects.toMatchObject({ code: "42501" });
  expect(await snapshotRows(f.admin)).toEqual(before);
 });
 it("foreign, missing and reused pooled contexts cannot mutate", async () => {
  const { a, value } = await prepared(f, "record_simulation"), b = await meterCompany(f);
  const args = [a.tenantId, a.digest, randomUUID(), JSON.stringify(value)];
  const sql = "SELECT app.mon2_command($1,$2,$3,$4::jsonb)";
  const before = await snapshotRows(f.admin);
  await expect(workTenant(f.runtime, b.tenantId, db => db.query(sql, args), { membershipId: b.actorId, bindRequest: false })).rejects.toMatchObject({ code: "42501" });
  await expect(command(f, { ...a, digest: b.digest }, value)).rejects.toMatchObject({ code: "42501" });
  await readSubscription(f, a);
  // Hold the same physical client through a valid transaction and its context-free reuse.
  const client = await f.runtime.connect();
  try {
   await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
   await client.query("SELECT app.mon2_read($1,$2)", [a.tenantId, a.digest]); await client.query("COMMIT");
   await expect(client.query(sql, args)).rejects.toMatchObject({ code: "42501" });
  } finally { await client.query("ROLLBACK"); client.release(); }
  expect(await snapshotRows(f.admin)).toEqual(before);
 });
 it.each(kinds)("scratch removal of the new %s guard fails the regression and is rolled back", async kind => {
  const { a, value } = await prepared(f, kind);
  await role(f, a, "admin");
  const original = await definition(f), before = await snapshotRows(f.admin);
  expect(original.split(guard)).toHaveLength(2);
  await rolledBack(f.admin, async db => {
   await db.query(original.replace(guard, ""));
   await db.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
   await db.query("SET LOCAL ROLE jobguard_runtime");
   const result = await db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb) result", [a.tenantId, a.digest, randomUUID(), JSON.stringify(value)]);
   expect(result.rows[0].result).toMatchObject({ kind });
   await expect(async () => { await expect(Promise.resolve(result)).rejects.toMatchObject(forbidden); }).rejects.toThrow();
  });
  expect(await definition(f)).toBe(original);
  expect(await snapshotRows(f.admin)).toEqual(before);
  await refusesWithoutWrites(f, a, value);
 });
});

describe("0744 populated predecessor upgrade (real PostgreSQL)", () => {
 let f: WorkFixture, runtime: Pool | undefined;
 beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
 afterAll(async () => { await runtime?.end(); await closeWorkFixture(f); });
 it("demonstrates prior admin writes, preserves populated rows and security metadata, then closes fresh and replay access", async () => {
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(`${stem}.sql`));
  expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
   await f.admin.query(readFileSync(url, "utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  // Separate non-owner runtime login; predecessor success cannot be a superuser bypass.
  const login = `ls149_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_runtime TO ${login}`);
  runtime = new Pool({ ...f.admin.options, user: login, password, max: 1 });
  const fixture = { ...f, runtime };
  const cases = [];
  for (const kind of kinds) {
   const scenario = await prepared(fixture, kind), id = randomUUID();
   await role(f, scenario.a, "admin");
   const first = await command(fixture, scenario.a, scenario.value, id);
   expect(first).toMatchObject(scenario.expected);
   cases.push({ ...scenario, id, first, fresh: await prepared(fixture, kind) });
  }
  const metadata = async () => (await f.admin.query("SELECT proowner,proacl::text,prosecdef,proconfig,proargtypes::text,prorettype FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows;
  const security = await metadata(), before = await snapshotRows(f.admin);
  await migrate(f.admin); await migrate(f.admin);
  expect(await metadata()).toEqual(security);
  // LP-6d and LP-10 add two empty private bookkeeping tables.
  expect(await snapshotRows(f.admin)).toEqual({ ...before, "identity.lp6d_sso_grant_permit": [], "control_plane.worker_action_binding": [] });
  for (const scenario of cases) {
   await refusesWithoutWrites(fixture, scenario.a, scenario.value, scenario.id);
   await role(f, scenario.a, "owner");
   expect(await command(fixture, scenario.a, scenario.value, scenario.id)).toEqual(scenario.first);
   const { a, value, expected } = scenario.fresh;
   await role(f, a, "admin"); await refusesWithoutWrites(fixture, a, value);
   await role(f, a, "owner"); expect(await command(fixture, a, value)).toMatchObject(expected);
  }
 }, 120000);
});
