import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { SubscriptionExecutor } from "../src/subscription-executor.js";
import { SubscriptionRepository } from "../src/subscription-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { approvedSimulation, command, count, issue, meterCompany, meterInput, rows, storeMeter, terms, type SubscriptionCompany } from "./subscription-persistence-fixtures.js";
import { rolledBack, snapshotRows } from "./upgrade-proof-utils.js";

const stem = "0754_subscription_attempt_reconciliation";
const signature = "app.mon2_command(uuid,text,uuid,jsonb)";
const migration = readFileSync(new URL(`../migrations/${stem}.sql`, import.meta.url), "utf8");
const predecessor = readFileSync(new URL("../migrations/0752_subscription_pending_downgrade.sql", import.meta.url), "utf8");
const oldGuard = "  IF work.id IS NULL OR work.agreement_revision<>current_revision OR NOT app.mon2_authorized(t,work.authorization_id,current_revision) THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;";
const exceptionStart = migration.indexOf("  IF kind='reconcile_simulation' THEN\n   -- Recover");
const exceptionEnd = migration.indexOf("\n  IF kind='execute_simulation' THEN", exceptionStart);
const exception = migration.slice(exceptionStart, exceptionEnd);
const body = (source: string) => source.slice(source.indexOf("CREATE OR REPLACE FUNCTION"), source.indexOf("\nCOMMIT;"));
const effects = (f: WorkFixture) => snapshotRows(f.admin, [
 "app.subscription_agreement_revision", "app.subscription_plan_change", "app.subscription_change_outcome", "app.platform_statement", "app.platform_statement_line", "app.subscription_period",
 "app.subscription_simulated_work", "app.subscription_simulated_attempt", "app.subscription_simulated_result",
 "app.action_authorization", "app.decision", "app.decision_resolution", "app.command_receipt", "app.audit_event", "audit_control.audit_head",
]);
const value = (workId: string, expectedRevision = 1, resultId = randomUUID(), outcome = "settled") =>
 ({ version: "subscription-command.v1", kind: "reconcile_simulation", workId, expectedRevision, resultId, outcome });
const definition = async (f: WorkFixture) => (await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition as string;

// Admin-only corruption/time fixtures use the established historical-fixture method.
// No runtime grant, production clock override or permissive binding fixture is added.
async function historicalEdit(f: WorkFixture, sql: string, args: unknown[]) {
 const db = await f.admin.connect();
 try {
  await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role='replica'");
  await db.query(sql, args); await db.query("COMMIT");
 } finally { await db.query("ROLLBACK"); db.release(); }
}
async function expire(f: WorkFixture, a: SubscriptionCompany, workId: string) {
 await historicalEdit(f, `UPDATE app.action_authorization SET expires_at=clock_timestamp()-interval '1 second'
  WHERE tenant_id=$1 AND id=(SELECT authorization_id FROM app.subscription_simulated_work WHERE tenant_id=$1 AND id=$2)`, [a.tenantId, workId]);
}
async function advance(f: WorkFixture, a: SubscriptionCompany) {
 // Existing September period has ended. A genuine, authorized same-plan revision
 // changes current terms without rewriting the historical period or its approval.
 return command(f, a, { ...terms(a, "Builder", 1), kind: "change" });
}
async function attempted(f: WorkFixture, unknown = false) {
 const scenario = await approvedSimulation(f);
 const { a, approved } = scenario;
 await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 });
 if (unknown) await command(f, a, { ...value(approved.workId, 1, randomUUID(), "outcome_unknown"), kind: "record_simulation" });
 return scenario;
}
function reconciler(f: WorkFixture, resultId = randomUUID(), outcome: "settled" | "failed" | "redirect" = "settled") {
 let calls = 0, executes = 0;
 const executor = new SubscriptionExecutor(new SubscriptionRepository(f.runtime), {
  async execute() { executes++; throw new Error("reconciliation must never execute"); },
  async reconcile(work) {
   calls++;
   return { version: "subscription-simulated-result.v1", synthetic: true, workId: work.workId, resultId, outcome };
  },
 });
 return { executor, resultId, calls: () => calls, executes: () => executes };
}
async function refuses(f: WorkFixture, a: SubscriptionCompany, input: Record<string, unknown>, id = randomUUID(), message?: string) {
 const before = await effects(f);
 const pending = command(f, a, input, id);
 if (message) await expect(pending).rejects.toThrow(message); else await expect(pending).rejects.toThrow();
 expect(await effects(f)).toEqual(before);
}

it("replaces only the attempted reconciliation guard, retaining the 0752 pending-change/owner-before-replay body and transaction", () => {
 expect(exceptionStart).toBeGreaterThan(0); expect(exceptionEnd).toBeGreaterThan(exceptionStart);
 expect(body(migration).replace(exception, oldGuard)).toBe(body(predecessor));
 expect(migration).toMatch(/\nBEGIN;\n/); expect(migration.trimEnd()).toMatch(/COMMIT;$/);
 expect(migration).not.toMatch(/\b(?:GRANT|REVOKE|ALTER|DROP)\b/);
 expect(migration).not.toContain("CREATE OR REPLACE FUNCTION app.mon2_authorized");
});

describe.sequential("LATER-SAFETY-158 attempted subscription reconciliation (real PostgreSQL)", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("0754 preserves pending-change refusal and exact replay without new money/approval/audit effects", async () => {
  const a = await meterCompany(f);
  const acceptedTerms = terms(a);
  await command(f, a, acceptedTerms);
  const input = { ...terms(a, "Solo", 1, acceptedTerms.anchorDay), kind: "change" }, id = randomUUID();
  const pending = await command(f, a, input, id);
  expect(pending).toMatchObject({ status: "pending", revision: 1 });
  expect(await definition(f)).toContain("SUBSCRIPTION_PENDING_CHANGE");
  const before = await effects(f);
  await expect(command(f, a, input)).rejects.toMatchObject({ message: "SUBSCRIPTION_PENDING_CHANGE", code: "23514" });
  expect(await effects(f)).toEqual(before);
  expect(await command(f, a, input, id)).toEqual(pending);
  expect(await effects(f)).toEqual(before);
 });
 for (const unknown of [false, true]) for (const change of ["expiry", "revision", "expiry and revision"]) {
  it(`${unknown ? "outcome_unknown" : "lost result"} reconciles after ${change} through the existing executor`, async () => {
   const { a, approved } = await attempted(f, unknown);
   if (change.includes("expiry")) await expire(f, a, approved.workId);
   const revision = change.includes("revision") ? (await advance(f, a)).revision : 1;
   const fixedTables = ["subscription_simulated_work", "subscription_agreement_revision", "action_authorization", "platform_statement", "platform_statement_line", "subscription_period"];
   const original = await Promise.all(fixedTables.map(table => rows(f, a, table)));
   const fake = reconciler(f);
   expect(await fake.executor.reconcile(a.context, a.digest, approved.workId, revision)).toEqual({
    version: "subscription-command-result.v1", kind: "reconcile_simulation", hypothetical: true, environment: "synthetic_demo",
    workId: approved.workId, statementId: approved.statementId, amountPence: approved.amountPence,
    contentHash: approved.contentHash, currency: "GBP", revision, resultId: fake.resultId, outcome: "settled", settled: true,
   });
   expect(fake.calls()).toBe(1); expect(fake.executes()).toBe(0);
   expect(await count(f, a, "subscription_simulated_attempt")).toBe(1);
   expect((await rows(f, a, "subscription_simulated_result")).filter(row => row.outcome === "settled")).toHaveLength(1);
   expect(await count(f, a, "subscription_simulated_result")).toBe(unknown ? 2 : 1);
   expect(await Promise.all(fixedTables.map(table => rows(f, a, table)))).toEqual(original);
  });
 }
 it("expiry while execute is in flight leaves one durable attempt whose lost result is recoverable", async () => {
  const { a, approved } = await approvedSimulation(f);
  let executes = 0;
  const resultId = randomUUID();
  const executor = new SubscriptionExecutor(new SubscriptionRepository(f.runtime), {
   async execute(work) {
    executes++; await expire(f, a, work.workId);
    return { version: "subscription-simulated-result.v1", synthetic: true, workId: work.workId, resultId, outcome: "settled" };
   },
   async reconcile(work) { return { version: "subscription-simulated-result.v1", synthetic: true, workId: work.workId, resultId, outcome: "settled" }; },
  });
  await expect(executor.execute(a.context, a.digest, randomUUID(), approved.workId, 1)).rejects.toThrow("SUBSCRIPTION_FORBIDDEN");
  expect(await count(f, a, "subscription_simulated_attempt")).toBe(1);
  expect(await count(f, a, "subscription_simulated_result")).toBe(0);
  expect(await executor.reconcile(a.context, a.digest, approved.workId, 1)).toMatchObject({ resultId, settled: true });
  expect(executes).toBe(1);
 });
 it("stale current revision, fresh execution and record remain refused after expiry/revision", async () => {
  const { a, approved } = await attempted(f);
  await expire(f, a, approved.workId); await advance(f, a);
  await refuses(f, a, value(approved.workId), undefined, "SUBSCRIPTION_STALE_REVISION");
  for (const kind of ["execute_simulation", "record_simulation"]) {
   const input = kind === "execute_simulation" ? { version: "subscription-command.v1", kind, workId: approved.workId, expectedRevision: 2 } : { ...value(approved.workId, 2), kind };
   await refuses(f, a, input, undefined, "SUBSCRIPTION_FORBIDDEN");
  }
 });
 it("never-attempted expired approval cannot execute or reconcile and adapter is not called", async () => {
  const { a, approved } = await approvedSimulation(f); await expire(f, a, approved.workId);
  await refuses(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: approved.workId, expectedRevision: 1 });
  await refuses(f, a, value(approved.workId));
  const fake = reconciler(f), before = await effects(f);
  await expect(fake.executor.reconcile(a.context, a.digest, approved.workId, 1)).rejects.toThrow("SUBSCRIPTION_FORBIDDEN");
  expect(fake.calls()).toBe(0); expect(fake.executes()).toBe(0); expect(await effects(f)).toEqual(before);
 });
 it.each(["authorization revoked", "approver revoked", "approver expired", "approver demoted", "contractor revocation"])("%s remains refused with a separate valid current owner", async invalid => {
  const { a, approved } = await attempted(f); await expire(f, a, approved.workId);
  const owner = await meterCompany(f, a.tenantId);
  if (invalid === "authorization revoked") await f.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=(SELECT authorization_id FROM app.subscription_simulated_work WHERE tenant_id=$1 AND id=$2)", [a.tenantId, approved.workId]);
  else if (invalid === "approver demoted") await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  else if (invalid === "contractor revocation") {
   await f.admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'owner@fictional.invalid')", [a.tenantId, a.actorId]);
   await f.admin.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)", [a.tenantId, randomUUID(), a.actorId]);
  }
  else await f.admin.query(`UPDATE app.membership SET ${invalid === "approver revoked" ? "revoked_at" : "expires_at"}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`, [a.tenantId, a.actorId]);
  await refuses(f, owner, value(approved.workId), undefined, "SUBSCRIPTION_FORBIDDEN");
 });
 it.each(["session expired", "session revoked", "membership expired", "membership revoked", "admin"])("current actor %s cannot reconcile or replay", async invalid => {
  const { a: approver, approved } = await attempted(f); await expire(f, approver, approved.workId);
  const a = await meterCompany(f, approver.tenantId), input = value(approved.workId), id = randomUUID();
  await command(f, a, input, id);
  if (invalid === "admin") await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  else if (invalid.startsWith("session")) await f.admin.query(`UPDATE identity.session SET ${invalid.endsWith("expired") ? "expires_at" : "revoked_at"}=clock_timestamp()-interval '1 second' WHERE id=$1`, [a.sessionId]);
  else await f.admin.query(`UPDATE app.membership SET ${invalid.endsWith("expired") ? "expires_at" : "revoked_at"}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2`, [a.tenantId, a.actorId]);
  await refuses(f, a, input, id); await refuses(f, a, value(approved.workId));
 });
 it("foreign work, absent tenant binding and forged session/tenant cannot reconcile", async () => {
  const { a, approved } = await attempted(f); await expire(f, a, approved.workId);
  const b = await meterCompany(f), input = value(approved.workId);
  await refuses(f, b, input); await refuses(f, { ...a, digest: b.digest }, input);
  await refuses(f, a, value(randomUUID()));
  const before = await effects(f), args = [a.tenantId, a.digest, randomUUID(), JSON.stringify(input)];
  await expect(f.runtime.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb)", args)).rejects.toMatchObject({ code: "42501" });
  await expect(withTenant(f.runtime, b.context, db => db.$client.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb)", args))).rejects.toMatchObject({ code: "42501" });
  await expect(command(f, { ...a, digest: "0".repeat(64) }, input)).rejects.toThrow();
  expect(await effects(f)).toEqual(before);
 });
 it.each([
  ["work statement", "UPDATE app.subscription_simulated_work SET statement_id=gen_random_uuid() WHERE tenant_id=$1"],
  ["work authorization", "UPDATE app.subscription_simulated_work SET authorization_id=gen_random_uuid() WHERE tenant_id=$1"],
  ["work agreement", "UPDATE app.subscription_simulated_work SET agreement_revision=999 WHERE tenant_id=$1"],
  ["statement hash", "UPDATE app.platform_statement SET artifact_hash=repeat('b',64) WHERE tenant_id=$1"],
  ["statement amount", "UPDATE app.platform_statement SET amount_pence=1 WHERE tenant_id=$1"],
  ["authorization hash", "UPDATE app.action_authorization SET content_hash=repeat('b',64) WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["authorization amount", "UPDATE app.action_authorization SET amount_pence=1 WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["authorization policy", "UPDATE app.action_authorization SET policy_version='wrong-policy' WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["authorization revision", "UPDATE app.action_authorization SET aggregate_revision=999 WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["authorization action", "UPDATE app.action_authorization SET action_type='subscription.change' WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["authorization decision", "UPDATE app.action_authorization SET decision_id=gen_random_uuid() WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["authorization resolution", "UPDATE app.action_authorization SET resolution_id=gen_random_uuid() WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["decision subject", "UPDATE app.decision SET subject_ref=gen_random_uuid()::text WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["decision action", "UPDATE app.decision SET action_type='subscription.change' WHERE tenant_id=$1 AND action_type='subscription.simulate'"],
  ["resolution actor", "UPDATE app.decision_resolution SET actor_membership_id=gen_random_uuid() WHERE tenant_id=$1"],
  ["resolution rejected", "UPDATE app.decision_resolution SET resolution='rejected' WHERE tenant_id=$1"],
 ] as const)("%s mismatch cannot reconcile even a durable expired attempt", async (_label, sql) => {
  const { a, approved } = await attempted(f); await expire(f, a, approved.workId);
  await historicalEdit(f, sql, [a.tenantId]);
  await refuses(f, a, value(approved.workId), undefined, "SUBSCRIPTION_FORBIDDEN");
 });
 it("result identities conflict, terminal outcomes are final, and exact concurrent replays have one result/audit effect", async () => {
  const { a, approved } = await attempted(f); await expire(f, a, approved.workId);
  const input = value(approved.workId), id = randomUUID(), audits = await count(f, a, "audit_event");
  const results = await Promise.all([command(f, a, input, id), command(f, a, input, id)]);
  expect(results[0]).toEqual(results[1]);
  expect(await count(f, a, "subscription_simulated_result")).toBe(1);
  expect(await count(f, a, "subscription_simulated_attempt")).toBe(1);
  expect(await count(f, a, "audit_event")).toBe(audits + 1);
  const before = await effects(f);
  expect(await command(f, a, input, id)).toEqual(results[0]); expect(await effects(f)).toEqual(before);
  await refuses(f, a, { ...input, outcome: "failed" }, undefined, "COMMAND_CONFLICT");
  await refuses(f, a, value(approved.workId, 1, randomUUID(), "failed"), undefined, "SUBSCRIPTION_RESULT_FINAL");
  await refuses(f, a, { ...input, outcome: "redirect" }, id, "COMMAND_CONFLICT");
  await storeMeter(f, a, meterInput(a.tenantId, 8, "2026-10", 31));
  const issued = await issue(f, a, "2026-10-01");
  const other = await command(f, a, { version: "subscription-command.v1", kind: "approve_simulation", statementId: issued.statementId, contentHash: issued.artifactHash, amountPence: issued.amountPence, expectedRevision: 1 });
  await command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: other.workId, expectedRevision: 1 });
  await refuses(f, a, value(other.workId, 1, input.resultId), undefined, "COMMAND_CONFLICT");
 });
 it("currency constraints and exact currency binding cannot be bypassed", async () => {
  const { a, approved } = await attempted(f); await expire(f, a, approved.workId);
  const before = await effects(f);
  await expect(historicalEdit(f, "UPDATE app.platform_statement SET currency='USD' WHERE tenant_id=$1", [a.tenantId])).rejects.toMatchObject({ code: "23514" });
  expect(await effects(f)).toEqual(before);
  // NULL amount/currency is legal for non-monetary authorizations, never for this work.
  await historicalEdit(f, "UPDATE app.action_authorization SET amount_pence=NULL,currency=NULL WHERE tenant_id=$1 AND action_type='subscription.simulate'", [a.tenantId]);
  await refuses(f, a, value(approved.workId), undefined, "SUBSCRIPTION_FORBIDDEN");
  await refuses(f, a, { ...value(approved.workId), currency: "USD" }, undefined, "INVALID_SUBSCRIPTION_COMMAND");
 });
 it("different concurrent terminal results have one winner", async () => {
  const { a, approved } = await attempted(f, true); await expire(f, a, approved.workId);
  const results = await Promise.allSettled([command(f, a, value(approved.workId)), command(f, a, value(approved.workId, 1, randomUUID(), "failed"))]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect((await rows(f, a, "subscription_simulated_result")).filter(row => ["settled", "failed"].includes(row.outcome))).toHaveLength(1);
  expect(await count(f, a, "subscription_simulated_attempt")).toBe(1);
 });
 it("a redirect remains unsettled and cannot be reconciled into settlement", async () => {
  const { a, approved } = await attempted(f);
  await command(f, a, { ...value(approved.workId, 1, randomUUID(), "redirect"), kind: "record_simulation" });
  await expire(f, a, approved.workId);
  await refuses(f, a, value(approved.workId), undefined, "SUBSCRIPTION_RECONCILIATION_NOT_REQUIRED");
  const fake = reconciler(f);
  await expect(fake.executor.reconcile(a.context, a.digest, approved.workId, 1)).rejects.toThrow();
  expect(fake.calls()).toBe(0); expect(fake.executes()).toBe(0);
  expect((await rows(f, a, "subscription_simulated_result")).map(row => row.outcome)).toEqual(["redirect"]);
 });
 it("executor refuses a fake adapter's foreign result work identity without writes", async () => {
  const { a, approved } = await attempted(f); await expire(f, a, approved.workId);
  const executor = new SubscriptionExecutor(new SubscriptionRepository(f.runtime), {
   async execute() { throw new Error("must not execute"); },
   async reconcile() { return { version: "subscription-simulated-result.v1", synthetic: true, workId: randomUUID(), resultId: randomUUID(), outcome: "settled" }; },
  });
  const before = await effects(f);
  await expect(executor.reconcile(a.context, a.digest, approved.workId, 1)).rejects.toThrow("SUBSCRIPTION_PROJECTION_MISMATCH");
  expect(await effects(f)).toEqual(before);
 });
 it.each(["expiry", "revision", "expiry and revision"])("removing only the exception breaks %s recovery and rolls back the scratch mutation", async change => {
  const { a, approved } = await attempted(f);
  if (change.includes("expiry")) await expire(f, a, approved.workId);
  const revision = change.includes("revision") ? (await advance(f, a)).revision : 1;
  const original = await definition(f), before = await effects(f);
  expect(original.split(exception)).toHaveLength(2);
  await rolledBack(f.admin, async db => {
   await db.query(original.replace(exception, oldGuard));
   await db.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
   await db.query("SET LOCAL ROLE jobguard_runtime");
   await expect(db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb)", [a.tenantId, a.digest, randomUUID(), JSON.stringify(value(approved.workId, revision))])).rejects.toMatchObject({ code: "42501", message: "SUBSCRIPTION_FORBIDDEN" });
  });
  expect(await definition(f)).toBe(original); expect(await effects(f)).toEqual(before);
  const fake = reconciler(f);
  expect(await fake.executor.reconcile(a.context, a.digest, approved.workId, revision)).toMatchObject({ settled: true, revision });
  expect(fake.executes()).toBe(0);
 });
});

describe("0754 populated predecessor upgrade (real PostgreSQL)", () => {
 let f: WorkFixture, runtime: Pool | undefined;
 beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
 afterAll(async () => { await runtime?.end(); await closeWorkFixture(f); });
 it("keeps populated historical work and security metadata, then reconciles after upgrade and repeat migrate", async () => {
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(`${stem}.sql`));
  expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
   await f.admin.query(readFileSync(url, "utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const { Pool: PgPool } = await import("pg");
  const login = `ls158_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_runtime TO ${login}`);
  runtime = new PgPool({ ...f.admin.options, user: login, password, max: 2 });
  const fixture = { ...f, runtime };
  const { a, approved } = await attempted(fixture, true);
  await expire(f, a, approved.workId); await advance(fixture, a);
  const input = value(approved.workId, 2);
  await refuses(fixture, a, input, undefined, "SUBSCRIPTION_FORBIDDEN");
  const metadata = async () => (await f.admin.query("SELECT proowner,proacl::text,prosecdef,proconfig,proargtypes::text,prorettype FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows;
  const security = await metadata(), before = await snapshotRows(f.admin);
  await migrate(f.admin); await migrate(f.admin);
  expect(await metadata()).toEqual(security); expect(await snapshotRows(f.admin)).toEqual(before);
  const fake = reconciler(fixture);
  expect(await fake.executor.reconcile(a.context, a.digest, approved.workId, 2)).toMatchObject({ settled: true, amountPence: approved.amountPence, contentHash: approved.contentHash, revision: 2 });
  expect(fake.executes()).toBe(0); expect(await count(fixture, a, "subscription_simulated_attempt")).toBe(1);
 });
});
