import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { FakeTrueLayerAisAdapter, SyntheticAisTokenVault, aisHash, type AisObservation, type AisPage } from "../src/ais-adapter.js";
import { DarkAisRepository } from "../src/ais-repository.js";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

type Company = Awaited<ReturnType<typeof meterCompany>>;
const window = { version: "ais-window.v1", from: "2026-10-01", to: "2026-10-31", cursor: null };
const obs = (revision = 1, status: AisObservation["status"] = "pending", extra: Partial<AisObservation> = {}): AisObservation => ({
 version: "ais-observation.v1", accountRef: "fake_account", movementRef: "fake_cash", providerRef: `fake_provider_${revision}`, revision, status,
 amount: { pence: 32000, currency: "GBP" }, bookedOn: "2026-10-02", ...extra,
});
const page = (observations: AisObservation[], nextCursor: string | null = null): AisPage => ({ version: "ais-page.v1", observations, nextCursor });
let f: WorkFixture;
beforeAll(async () => {
 f = await createWorkFixture(false);
 await f.admin.query("CREATE DATABASE jobguard_synthetic_demo");
 const options = { ...f.admin.options, database: "jobguard_synthetic_demo" };
 await f.admin.end(); await f.runtime.end();
 f.admin = new Pool(options);
 // Upgrade proof: install the exact previous supported schema, then discover 0427.
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for (const url of MIGRATION_URLS.filter(url => !url.pathname.endsWith("0427_dark_ais.sql"))) {
  await f.admin.query(await readFile(url, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const historical = await meterCompany(f);
 await migrate(f.admin);
 expect((await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2", [historical.tenantId, historical.jobId])).rows).toHaveLength(1);
 const credential = randomUUID(), login = `ais_${randomUUID().replaceAll("-", "")}`;
 await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT jobguard_runtime TO ${login}`);
 f.runtime = new Pool({ ...options, user: login, password: credential, max: 2 });
}, 120_000);
afterAll(async () => closeWorkFixture(f));

async function setup(pages = new Map<string, AisPage>([["first", page([obs()])]]), a?: Company) {
 a ??= await meterCompany(f);
 const adapter = new FakeTrueLayerAisAdapter(), vault = new SyntheticAisTokenVault();
 const repository = new DarkAisRepository(f.runtime, adapter, vault, "synthetic_demo"), id = randomUUID();
 const consent = await repository.start(a.context, a.digest, { version: "ais-start.v1", connectionId: id, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
 const code = adapter.register({ version: "ais-binding.v1", tenantId: a.tenantId, connectionId: id, stateHash: aisHash(consent.state) }, "fake_account", pages);
 const callback = { version: "ais-callback.v1", state: consent.state, code };
 return { a, adapter, vault, repository, id, callback, pages };
}
async function linked(pages?: Map<string, AisPage>, a?: Company) {
 const s = await setup(pages, a); await s.repository.callback(s.a.context, s.a.digest, s.id, s.callback); return s;
}
const counts = async (tenant: string) => (await f.admin.query(`SELECT
 (SELECT count(*)::int FROM app.ais_observation WHERE tenant_id=$1) observations,
 (SELECT count(*)::int FROM app.ais_page WHERE tenant_id=$1) pages,
 (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'ais.%') audits`, [tenant])).rows[0];

describe("M4-7 DARK AIS PostgreSQL boundary", () => {
 it("forged/swapped/cross-tenant callbacks fail and a valid callback is consumed exactly once", async () => {
  const s = await setup(), other = await meterCompany(f);
  await expect(s.repository.callback(s.a.context, s.a.digest, s.id, { ...s.callback, state: randomUUID() })).rejects.toThrow("AIS_CALLBACK_INVALID");
  await expect(s.repository.callback(s.a.context, s.a.digest, s.id, { ...s.callback, code: "fake_forged" })).rejects.toThrow("AIS_CALLBACK_INVALID");
  await expect(s.repository.callback(other.context, other.digest, s.id, s.callback)).rejects.toThrow("AIS_NOT_FOUND");
  const swapped = await setup(undefined, s.a);
  await expect(swapped.repository.callback(s.a.context, s.a.digest, swapped.id, { ...swapped.callback, code: s.callback.code })).rejects.toThrow("AIS_CALLBACK_INVALID");
  expect((await s.repository.callback(s.a.context, s.a.digest, s.id, s.callback)).status).toBe("linked");
  await expect(s.repository.callback(s.a.context, s.a.digest, s.id, s.callback)).rejects.toThrow("AIS_CALLBACK_INVALID");
  await expect(s.repository.read(s.a.context, other.digest, s.id)).rejects.toThrow("AIS_FORBIDDEN");
 });
 it("duplicate/concurrent pulls, pagination overlap and changed provider IDs preserve one stable cash identity", async () => {
  const s = await linked(new Map([["first", page([obs(2, "settled")], "fake_next")], ["fake_next", page([obs(1), obs(2, "settled")])]]));
  const results = await Promise.all([s.repository.pull(s.a.context, s.a.digest, s.id, window), s.repository.pull(s.a.context, s.a.digest, s.id, window)]);
  expect(results.map(r => r.changed).sort()).toEqual([false, true]);
  await s.repository.pull(s.a.context, s.a.digest, s.id, { ...window, cursor: "fake_next" });
  const previous = await counts(s.a.tenantId);
  const restarted = new DarkAisRepository(f.runtime, s.adapter, s.vault, "synthetic_demo");
  expect((await restarted.pull(s.a.context, s.a.digest, s.id, window)).changed).toBe(false);
  expect(await counts(s.a.tenantId)).toEqual(previous);
  const facts = (await f.admin.query("SELECT * FROM app.ais_observation WHERE tenant_id=$1 ORDER BY revision DESC", [s.a.tenantId])).rows;
  expect(facts.map(r => r.status)).toEqual(["settled", "pending"]);
  expect(new Set(facts.map(r => r.movement_ref)).size).toBe(1);
  expect(previous).toMatchObject({ observations: 2, pages: 2, audits: 4 });
 });
 it("backfill and relinking preserve cash identity; issued cursors stay window-bound and cyclic pages fail", async () => {
  const s = await linked();
  const raw = (p: AisPage, w: unknown = window) => workTenant(f.runtime, s.a.tenantId, db => db.query("SELECT app.dark_ais($1,$2,$3,'page',$4::jsonb)", [s.a.tenantId, s.a.digest, s.id, JSON.stringify({ window: w, page: p })]));
  await raw(page([obs()], "fake_a"));
  await raw(page([], "fake_b"), { ...window, cursor: "fake_a" });
  await expect(raw(page([], "fake_a"), { ...window, cursor: "fake_b" })).rejects.toThrow("AIS_CURSOR_INVALID");
  await expect(raw(page([]), { ...window, from: "2026-10-02", cursor: "fake_a" })).rejects.toThrow("AIS_CURSOR_INVALID");
  await raw(page([obs()]), { ...window, from: "2026-09-01" });
  await s.repository.stop(s.a.context, s.a.digest, s.id, "unlinked");
  const relinked = await linked(undefined, s.a);
  await relinked.repository.pull(s.a.context, s.a.digest, relinked.id, window);
  expect((await counts(s.a.tenantId)).observations).toBe(1);
 });
 it("rejects conflicting replays, ambiguous IDs, swapped account refs and invalid cursors atomically", async () => {
  const s = await linked(); await s.repository.pull(s.a.context, s.a.digest, s.id, window);
  const before = await counts(s.a.tenantId);
  const raw = (p: unknown, w: unknown = window) => workTenant(f.runtime, s.a.tenantId, db => db.query("SELECT app.dark_ais($1,$2,$3,'page',$4::jsonb)", [s.a.tenantId, s.a.digest, s.id, JSON.stringify({ window: w, page: p })]));
  await expect(raw(page([obs(1, "pending", { amount: { pence: 32001, currency: "GBP" } })]))).rejects.toThrow("AIS_CONFLICT");
  await expect(raw(page([obs(2, "settled", { movementRef: "fake_other", providerRef: "fake_provider_1" })]))).rejects.toThrow("AIS_IDENTITY_AMBIGUOUS");
  await expect(raw(page([obs(2, "settled", { accountRef: "fake_swapped" })]))).rejects.toThrow("AIS_INVALID");
  await expect(raw(page([obs(2, "settled")]), { ...window, cursor: "fake_never_issued" })).rejects.toThrow("AIS_CURSOR_INVALID");
  // A valid first row followed by poison must roll back the whole page and its audit.
  await expect(raw(page([obs(2, "settled"), { ...obs(3, "reversed"), amount: { pence: 1_000_000_000_001, currency: "GBP" } }]))).rejects.toThrow();
  for (const extra of [{ lockedBillId: randomUUID() }, { shadowSignals: [] }, { allocationPence: 1 }, { landed: true }, { token: "fake_secret" }])
   await expect(raw({ ...page([]), observations: [{ ...obs(2, "settled"), ...extra }] })).rejects.toThrow("AIS_INVALID");
  expect(await counts(s.a.tenantId)).toEqual(before);
 });
 it("append-only reversal survives stale updates; settlement regression/reopening needs reconciliation", async () => {
  const s = await linked();
  const raw = (o: AisObservation) => workTenant(f.runtime, s.a.tenantId, db => db.query("SELECT app.dark_ais($1,$2,$3,'page',$4::jsonb)", [s.a.tenantId, s.a.digest, s.id, JSON.stringify({ window, page: page([o]) })]));
  await raw(obs(2, "settled")); await raw(obs(3, "reversed")); await raw(obs(1));
  await expect(raw(obs(4, "settled"))).rejects.toThrow("AIS_RECONCILIATION_REQUIRED");
  await expect(raw(obs(4, "pending"))).rejects.toThrow("AIS_RECONCILIATION_REQUIRED");
  const latest = (await f.admin.query("SELECT status FROM app.ais_observation WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1", [s.a.tenantId])).rows[0];
  expect(latest.status).toBe("reversed");
 });
 it("expiry, unlink, consent revocation, revoked tokens and permission revocation stop pulls including replays", async () => {
  for (const kind of ["revoked", "unlinked", "token_revoked"] as const) {
   const s = await linked(); await s.repository.pull(s.a.context, s.a.digest, s.id, window);
   await s.repository.stop(s.a.context, s.a.digest, s.id, kind);
   expect(await s.vault.get(s.id)).toBeUndefined();
   await expect(s.repository.pull(s.a.context, s.a.digest, s.id, window)).rejects.toThrow("AIS_INACTIVE");
  }
  const s = await linked();
  s.adapter.revokeToken((await s.vault.get(s.id))!);
  await expect(s.repository.pull(s.a.context, s.a.digest, s.id, window)).rejects.toThrow("AIS_TOKEN_REVOKED");
  expect((await s.repository.read(s.a.context, s.a.digest, s.id)).status).toBe("token_revoked");
  const expiry = await linked();
  await f.admin.query("ALTER TABLE app.ais_connection DISABLE TRIGGER immutable_rows");
  try { await f.admin.query("UPDATE app.ais_connection SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE tenant_id=$1", [expiry.a.tenantId]); }
  finally { await f.admin.query("ALTER TABLE app.ais_connection ENABLE TRIGGER immutable_rows"); }
  expect((await expiry.repository.read(expiry.a.context, expiry.a.digest, expiry.id)).status).toBe("expired");
  await expect(expiry.repository.pull(expiry.a.context, expiry.a.digest, expiry.id, window)).rejects.toThrow("AIS_INACTIVE");
  const denied = await linked();
  await f.admin.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1", [denied.a.tenantId]);
  await expect(denied.repository.read(denied.a.context, denied.a.digest, denied.id)).rejects.toThrow("AIS_FORBIDDEN");
 });
 it("rechecks consent after an in-flight adapter call; observations never allocate, land, charge or leak hidden data", async () => {
  const s = await linked();
  const original = s.adapter.pull.bind(s.adapter);
  s.adapter.pull = async (...args) => { const result = await original(...args); await s.repository.stop(s.a.context, s.a.digest, s.id, "unlinked"); return result; };
  await expect(s.repository.pull(s.a.context, s.a.digest, s.id, window)).rejects.toThrow("AIS_INACTIVE");
  expect((await counts(s.a.tenantId)).observations).toBe(0);
  const clean = await linked();
  const tables = ["recovery_case", "journal", "action_outbox"];
  const totals = async () => Promise.all(tables.map(async table => (await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [clean.a.tenantId])).rows[0].n));
  const before = await totals(); const progress = await clean.repository.pull(clean.a.context, clean.a.digest, clean.id, window);
  expect(await totals()).toEqual(before);
  expect(Object.keys(progress).sort()).toEqual(["changed", "nextCursor", "version"]);
  const audit = JSON.stringify((await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'ais.%'", [clean.a.tenantId])).rows);
  expect(audit).not.toContain((await clean.vault.get(clean.id))!); expect(audit).not.toMatch(/fake_account|fake_cash|32000|shadow/u);
 });
 it("catalog grants, FORCE RLS, tenant-qualified keys, immutable history and runtime SQL denial hold", async () => {
  const s = await linked(), other = await meterCompany(f);
  const tables = ["ais_connection", "ais_lifecycle", "ais_observation", "ais_page"];
  for (const table of tables) {
   const cat = (await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass", [`app.${table}`])).rows[0];
   expect(cat).toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration" });
   const grants = (await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') writes,has_table_privilege('jobguard_runtime',$1,'SELECT') reads", [`app.${table}`])).rows[0];
   expect(grants).toEqual({ writes: false, reads: true });
   await expect(workTenant(f.runtime, s.a.tenantId, db => db.query(`DELETE FROM app.${table} WHERE tenant_id=$1`, [s.a.tenantId]))).rejects.toThrow();
   await expect(workTenant(f.runtime, s.a.tenantId, db => db.query(`INSERT INTO app.${table} DEFAULT VALUES`))).rejects.toThrow(/permission denied/u);
   expect((await workTenant(f.runtime, other.tenantId, db => db.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`, [s.a.tenantId]))).rows).toEqual([]);
   expect((await f.runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
  }
  await expect(f.admin.query("DELETE FROM app.ais_connection WHERE tenant_id=$1", [s.a.tenantId])).rejects.toThrow("AIS_IMMUTABLE");
  expect((await f.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
  // Same runtime login against a differently named database must fail before session/data access.
  const liveName = new Pool({ ...f.runtime.options, database: "postgres" });
  const liveAdmin = new Pool({ ...f.admin.options, database: "postgres" });
  try {
   await migrate(liveAdmin);
   await expect(new DarkAisRepository(liveName, s.adapter, s.vault, "synthetic_demo").read(s.a.context, s.a.digest, s.id)).rejects.toThrow("AIS_DARK_ONLY");
  } finally { await liveName.end(); await liveAdmin.end(); }
 });
});
