import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SyntheticMobileAuthApplication } from "../../../apps/api/src/auth/mobile-auth.application.js";
import { MemoryAuthProvider } from "../../../apps/api/src/auth/auth-provider.js";
import { PostgresSyntheticMobileAuthStore } from "../src/mobile-auth-store.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";

let db: Cluster, identity: Pool;
const origin = "https://mobile.invalid";
const policy = { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1", accessDurationMs: 100, refreshDurationMs: 500, sessionDurationMs: 1000, readLeaseDurationMs: 200 };
beforeAll(async () => {
 // Fresh-install suite; the final case separately upgrades the exact predecessor schema.
 db = await cluster();
 await db.admin.query("CREATE ROLE mobile_fixture_identity LOGIN PASSWORD 'synthetic' INHERIT; GRANT jobguard_identity TO mobile_fixture_identity");
 identity = new Pool({ ...db.config, database: "jobguard_synthetic_demo", user: "mobile_fixture_identity", max: 2 });
 await migrate(db.admin);
}, 120000);
afterAll(async () => { await identity?.end(); await db?.close(); });
async function fixture() {
 const source = new MemoryAuthProvider("fictional-mobile-store-key", () => {}, () => 1000, () => "12345678");
 const email = `${randomUUID()}@fixture.invalid`;
 await source.requestCode({ email, purpose: "signup", ip: "192.0.2.1" });
 const session = await source.verifyCode(email, "signup", "12345678");
 const member = source.fixtureMemberships()[0]!;
 const credentials = { ...session, origin, requestedTenantId: member.tenantId };
 // Each app has a new repository: no instance-local cache or shared mutex can prove durability.
 const app = () => new SyntheticMobileAuthApplication(source, policy, { enabled: true, environment: "synthetic_demo", allowedOrigin: origin, now: () => 1000, store: new PostgresSyntheticMobileAuthStore(identity) });
 const exchange = (tenantId = member.tenantId, deviceInstanceId = "fictional-device") => ({ version: "mobile-exchange.v1", requestedTenantId: tenantId, commandId: randomUUID(), deviceInstanceId });
 const rotate = (refresh: unknown) => ({ version: "mobile-rotation.v1", commandId: randomUUID(), deviceInstanceId: "fictional-device", refresh });
 const reconnect = (access: unknown, deviceInstanceId = "fictional-device") => ({ version: "mobile-reconnect.v1", deviceInstanceId, access });
 const revoke = (action = "revoke", requestedTenantId = member.tenantId) => ({ version: "mobile-device-command.v1", commandId: randomUUID(), deviceInstanceId: "fictional-device", requestedTenantId, action });
 return { source, email, member, credentials, app, exchange, rotate, reconnect, revoke };
}
it("commits refresh reuse revocation across restart and concurrent replicas; never stores bearer credentials", async () => {
 const f = await fixture(), command = f.exchange();
 const first = await f.app().exchange(command, f.credentials);
 await expect(f.app().exchange(command, f.credentials)).rejects.toMatchObject({ code: "MOBILE_REPLAY" });
 const next = await f.app().rotate(f.rotate(first.refresh), f.credentials);
 await expect(f.app().rotate(f.rotate(first.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 await expect(f.app().rotate(f.rotate(next.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 await expect(f.app().reconnect(f.reconnect(next.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 const fresh = await f.app().exchange(f.exchange(), f.credentials);
 const outcomes = await Promise.allSettled([f.app().rotate(f.rotate(fresh.refresh), f.credentials), f.app().rotate(f.rotate(fresh.refresh), f.credentials)]);
 const winners = outcomes.filter(r => r.status === "fulfilled"); expect(winners).toHaveLength(1);
 if (winners[0]?.status !== "fulfilled") throw new Error("missing winner");
 await expect(f.app().reconnect(f.reconnect(winners[0].value.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 const stored = JSON.stringify((await identity.query("SELECT state FROM identity.mobile_auth_fixture_state")).rows);
 for (const secret of [first.refresh.credential, next.access.credential, f.credentials.sessionToken!, f.credentials.csrfToken!, f.email]) expect(stored).not.toContain(secret);
});
it("fixture inspection reads committed state across fresh PostgreSQL-backed instances", async () => {
 const f = await fixture(), observer = f.app();
 const ownFamilies = async () => (await observer.fixtureRecords()).families.filter(r => r.partition.userId === f.member.identityUserId);
 expect(await ownFamilies()).toEqual([]);
 const issued = await f.app().exchange(f.exchange(), f.credentials);
 expect(await ownFamilies()).toEqual([expect.objectContaining({ partition: issued.partition })]);
 await f.app().deviceCommand(f.revoke(), f.credentials);
 expect(await ownFamilies()).toEqual([expect.objectContaining({ reason: "revoke", revokedAtMs: 1000, lease: expect.objectContaining({ expiresAtMs: 1000 }) })]);
});
it.each(["logout", "revoke"])("%s revokes all tenant families durably, and a new user inherits no old partition", async action => {
 const f = await fixture(), otherTenant = randomUUID();
 f.source.invite(f.email, otherTenant, "foreman");
 await f.source.requestCode({ email: f.email, purpose: "invitation", ip: "192.0.2.1" });
 await f.source.verifyCode(f.email, "invitation", "12345678");
 const first = await f.app().exchange(f.exchange(), f.credentials);
 const otherCredentials = { ...f.credentials, requestedTenantId: otherTenant };
 const second = await f.app().exchange(f.exchange(otherTenant), otherCredentials);
 const anotherDevice = await f.app().exchange(f.exchange(f.member.tenantId, "other-device"), f.credentials);
 await f.app().deviceCommand(f.revoke(action), f.credentials);
 for (const [token, credentials] of [[first, f.credentials], [second, otherCredentials]] as const) {
  await expect(f.app().rotate(f.rotate(token.refresh), credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app().reconnect(f.reconnect(token.access), credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 }
 await expect(f.app().exchange(f.exchange(otherTenant), otherCredentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 await expect(f.app().reconnect(f.reconnect(anotherDevice.access, "other-device"), f.credentials)).resolves.toBeDefined();
 const email = `${randomUUID()}@fixture.invalid`;
 await f.source.requestCode({ email, purpose: "signup", ip: "192.0.2.2" });
 const session = await f.source.verifyCode(email, "signup", "12345678");
 const member = f.source.fixtureMemberships().find(m => m.email === email)!;
 const credentials = { ...session, origin, requestedTenantId: member.tenantId };
 await expect(f.app().reconnect(f.reconnect(first.access), credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 const replacement = await f.app().exchange(f.exchange(member.tenantId), credentials);
 expect(replacement.partition).toMatchObject({ userId: member.identityUserId, tenantId: member.tenantId, membershipId: member.id });
 expect(replacement.partition.userId).not.toBe(first.partition.userId);
});
it("refuses cross-tenant revoke without harming the victim; no business/worker role can access state", async () => {
 const f = await fixture(), victim = await f.app().exchange(f.exchange(), f.credentials), other = await fixture();
 await expect(f.app().deviceCommand(f.revoke("revoke", other.member.tenantId), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 await expect(f.app().deviceCommand(f.revoke(), other.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 await expect(f.app().reconnect(f.reconnect(victim.access), f.credentials)).resolves.toBeDefined();
 await expect(db.runtime.query("SELECT * FROM identity.mobile_auth_fixture_state")).rejects.toMatchObject({ code: "42501" });
 for (const role of ["jobguard_runtime", "jobguard_infrastructure"]) {
  const permissions = (await db.admin.query("SELECT has_table_privilege($1,'identity.mobile_auth_fixture_state','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed", [role])).rows[0];
  expect(permissions.allowed).toBe(false);
  expect((await db.admin.query("SELECT has_any_column_privilege($1,'identity.mobile_auth_fixture_state','SELECT,INSERT,UPDATE,REFERENCES') allowed", [role])).rows[0].allowed).toBe(false);
 }
 const posture = (await db.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='identity.mobile_auth_fixture_state'::regclass")).rows;
 expect(posture).toEqual([{ relrowsecurity: false, relforcerowsecurity: false }]);
 const inventory = JSON.parse(await readFile(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8"));
 expect(inventory.recorded.rls.filter((row: string) => row.startsWith("identity.mobile_auth_fixture_state|"))).toEqual(["identity.mobile_auth_fixture_state|rls=f|forced=f"]);
 expect((await db.admin.query("SELECT tableowner FROM pg_tables WHERE schemaname='identity' AND tablename='mobile_auth_fixture_state'")).rows[0].tableowner).toBe("jobguard_migration");
});
it("0482 upgrades the previous supported schema without touching existing identity rows", async () => {
 // Dedicated empty database: no DROP or edits to an already applied migration.
 await db.admin.query("CREATE DATABASE mobile_auth_upgrade");
 const admin = new Pool({ ...db.config, database: "mobile_auth_upgrade" });
 try {
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const own = MIGRATION_URLS.findIndex(u => u.pathname.endsWith("/0482_mobile_auth_store.sql"));
  expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) {
   await admin.query(await readFile(url, "utf8"));
   await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  const user = randomUUID(); await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await migrate(admin); await migrate(admin);
  expect((await admin.query("SELECT id FROM identity.identity_user WHERE id=$1", [user])).rows).toEqual([{ id: user }]);
  expect((await admin.query("SELECT * FROM identity.mobile_auth_fixture_state")).rows).toEqual([]);
 } finally { await admin.end(); }
});
