import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, verify } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SyntheticTenantKeyRegistry, TenantKeyRegistryError } from "../src/tenant-key-registry.js";
import { migrate } from "../src/migrate.js";
import { verifiedTenantContextForQueuedJob, withTenant } from "../src/tenant-context.js";
import { startBeforeMigration, applyMigration, snapshot, type Cluster } from "./contractor-entitlement-fixtures.js";

const own = "0521_tenant_key_registry.sql";
let c: Cluster, owner: Pool;
let before: Awaited<ReturnType<typeof snapshot>>;
const t = randomUUID(), other = randomUUID();
const context = verifiedTenantContextForQueuedJob(t), foreign = verifiedTenantContextForQueuedJob(other);
const request = () => ({ version: "tenant-key-command.v1", commandId: randomUUID() });
function key() {
  const keys = generateKeyPairSync("ed25519");
  const fingerprint = createHash("sha256").update(keys.publicKey.export({ type: "spki", format: "der" })).digest("hex");
  return { ...keys, fingerprint };
}
function input(keyVersion: number, fingerprint: string, operation: string) {
  return { version: "tenant-key-use.v1", keyVersion, fingerprint, operation };
}
beforeAll(async () => {
  c = await startBeforeMigration(own);
  before = await snapshot(c.admin);
  await applyMigration(c, own);
  await c.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [t, other]);
  // Assurance role only. Business runtime gets neither registry reads nor writes.
  await c.admin.query("CREATE ROLE key_registry_test LOGIN PASSWORD 'synthetic' INHERIT NOSUPERUSER NOBYPASSRLS; GRANT jobguard_migration TO key_registry_test");
  owner = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "key_registry_test" });
}, 120000);
afterAll(async () => { await owner?.end(); await c?.close(); });

it("upgrade adds exactly empty registry tables; repeat migration preserves every prior row", async () => {
  const after = await snapshot(c.admin);
  expect(after).toEqual({ ...before, "control_plane.tenant": after["control_plane.tenant"], "app.tenant_key_version": [], "app.tenant_key_revocation": [] });
  await migrate(c.admin);
  expect(await snapshot(c.admin)).toEqual(after);
});

it("rotation retains old signatures, retires signing, and persists revocation across fresh pools and services", async () => {
  const registry = new SyntheticTenantKeyRegistry(owner, true), a = key(), b = key();
  const payload = randomBytes(32);
  expect(await registry.rotate(context, { ...request(), fingerprint: a.fingerprint })).toBe(1);
  const signature = await registry.withKey(context, input(1, a.fingerprint, "sign"), () => sign(null, payload, a.privateKey));
  expect(await registry.rotate(context, { ...request(), fingerprint: b.fingerprint })).toBe(2);
  expect(await registry.withKey(context, input(1, a.fingerprint, "verify"), () => verify(null, payload, a.publicKey, signature))).toBe(true);
  for (const operation of ["sign", "wrap"]) {
    await expect(registry.withKey(context, input(1, a.fingerprint, operation), () => true)).rejects.toThrow(TenantKeyRegistryError);
  }
  const revoke = { ...request(), keyVersion: 1 };
  await registry.revoke(context, revoke);
  await owner.end();
  owner = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "key_registry_test" });
  const restarted = new SyntheticTenantKeyRegistry(owner, true);
  await restarted.revoke(context, revoke);
  for (const operation of ["sign", "verify", "wrap", "unwrap"]) {
    let called = false;
    await expect(restarted.withKey(context, input(1, a.fingerprint, operation), () => { called = true; return true; })).rejects.toThrow(TenantKeyRegistryError);
    expect(called).toBe(false);
  }
  await restarted.revoke(context, { ...request(), keyVersion: 2 });
  await expect(restarted.withKey(context, input(2, b.fingerprint, "sign"), () => true)).rejects.toThrow(TenantKeyRegistryError);
  // No fallback to a retired or revoked version; a new rotation is necessary.
  const next = key();
  expect(await restarted.rotate(context, { ...request(), fingerprint: next.fingerprint })).toBe(3);
  expect(await restarted.withKey(context, input(3, next.fingerprint, "wrap"), () => true)).toBe(true);
});

it("refuses cross-tenant key use, foreign fingerprints, missing versions, and reused custody material", async () => {
  const registry = new SyntheticTenantKeyRegistry(owner, true), a = key();
  await registry.rotate(foreign, { ...request(), fingerprint: a.fingerprint });
  for (const operation of ["sign", "verify", "wrap", "unwrap"]) {
    await expect(registry.withKey(context, input(1, a.fingerprint, operation), () => true)).rejects.toThrow(TenantKeyRegistryError);
    await expect(registry.withKey(foreign, input(999, a.fingerprint, operation), () => true)).rejects.toThrow(TenantKeyRegistryError);
  }
  await expect(registry.rotate(context, { ...request(), fingerprint: a.fingerprint })).rejects.toThrow(TenantKeyRegistryError);
  await withTenant(owner, foreign, async db => {
    expect((await db.$client.query("SELECT * FROM app.tenant_key_version WHERE tenant_id=$1", [t])).rows).toEqual([]);
    await expect(db.$client.query("INSERT INTO app.tenant_key_revocation(tenant_id,version,command_id) VALUES($1,1,$2)", [t, randomUUID()])).rejects.toMatchObject({ code: "42501" });
  });
});

it("concurrent replay creates one version and one audit effect; changed payload or operation conflicts", async () => {
  const registry = new SyntheticTenantKeyRegistry(owner, true), a = key();
  const cmd = { ...request(), fingerprint: a.fingerprint };
  const values = await Promise.all([registry.rotate(context, cmd), registry.rotate(context, cmd)]);
  expect(values[0]).toBe(values[1]);
  await expect(registry.rotate(context, { ...cmd, fingerprint: key().fingerprint })).rejects.toThrow(TenantKeyRegistryError);
  await expect(registry.revoke(context, { ...request(), commandId: cmd.commandId, keyVersion: values[0] })).rejects.toThrow(TenantKeyRegistryError);
  const revoke = { ...request(), keyVersion: values[0] };
  await Promise.all([registry.revoke(context, revoke), registry.revoke(context, revoke)]);
  for (const id of [cmd.commandId, revoke.commandId]) {
    expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'commandId'=$2", [t, id])).rows[0].n).toBe(1);
  }
  await expect(registry.revoke(context, { ...request(), keyVersion: 999 })).rejects.toThrow(TenantKeyRegistryError);
});

it("immutable catalog and runtime privileges cannot bypass durable revocation", async () => {
  for (const table of ["tenant_key_version", "tenant_key_revocation"]) {
    const rows = (await c.admin.query(`SELECT pg_get_userbyid(relowner) owner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass`, [`app.${table}`])).rows;
    expect(rows).toEqual([{ owner: "jobguard_migration", relrowsecurity: true, relforcerowsecurity: true }]);
    for (const role of ["jobguard_runtime", "jobguard_infrastructure"]) {
      expect((await c.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed", [role, `app.${table}`])).rows[0].allowed).toBe(false);
    }
    for (const sql of [`UPDATE app.${table} SET version=version`, `DELETE FROM app.${table}`, `TRUNCATE app.${table} CASCADE`]) {
      await expect(c.admin.query(sql)).rejects.toThrow("TENANT_KEY_REGISTRY_IMMUTABLE");
    }
  }
  const registry = new SyntheticTenantKeyRegistry(c.runtime, true);
  await expect(registry.rotate(context, { ...request(), fingerprint: key().fingerprint })).rejects.toThrow(TenantKeyRegistryError);
});

it("fake-crypto failure changes no registry or audit facts; revocation cannot be removed by rollback", async () => {
  const registry = new SyntheticTenantKeyRegistry(owner, true), a = key();
  const version = await registry.rotate(context, { ...request(), fingerprint: a.fingerprint });
  const prior = await snapshot(c.admin);
  await expect(registry.withKey(context, input(version, a.fingerprint, "sign"), () => { throw new Error("synthetic provider denied"); })).rejects.toThrow(TenantKeyRegistryError);
  expect(await snapshot(c.admin)).toEqual(prior);
  expect(await registry.withKey(context, input(version, a.fingerprint, "unwrap"), () => true)).toBe(true);
  await registry.revoke(context, { ...request(), keyVersion: version });
  const revoked = await snapshot(c.admin);
  await expect(c.admin.query("DELETE FROM app.tenant_key_revocation WHERE tenant_id=$1 AND version=$2", [t, version])).rejects.toThrow("TENANT_KEY_REGISTRY_IMMUTABLE");
  expect(await snapshot(c.admin)).toEqual(revoked);
  await expect(registry.withKey(context, input(version, a.fingerprint, "unwrap"), () => true)).rejects.toThrow(TenantKeyRegistryError);
});

// Attack the SQL boundary as well as the service: the TypeScript wrapper alone
// must not be what conceals a foreign tenant's unique-index conflict.
it("registration refuses malformed and reused keys with identical errors and no constraint metadata", async () => {
  const registry = new SyntheticTenantKeyRegistry(owner, true), a = key();
  const version = await registry.rotate(context, { ...request(), fingerprint: a.fingerprint });
  const before = await snapshot(c.admin);
  async function sqlRefusal(ctx: typeof context, fingerprint: string) {
    try {
      await withTenant(owner, ctx, db => db.$client.query("SELECT app.register_tenant_key($1,$2,$3)", [999999, randomUUID(), fingerprint]));
      throw new Error("registration unexpectedly succeeded");
    } catch (error) {
      const e = error as Error & Record<string, unknown>;
      expect(e.message).toBe("TENANT_KEY_REGISTRY_REFUSED");
      expect(e.code).toBe("P0001");
      expect(e.constraint).toBeUndefined();
      expect(e.detail).toBeUndefined();
      return { message: e.message, code: e.code, detail: e.detail, hint: e.hint,
        constraint: e.constraint, schema: e.schema, table: e.table, column: e.column, where: e.where };
    }
  }
  const malformed = await sqlRefusal(foreign, "malformed");
  expect(await sqlRefusal(foreign, a.fingerprint)).toEqual(malformed);
  expect(await sqlRefusal(context, a.fingerprint)).toEqual(malformed);
  async function serviceRefusal(ctx: typeof context, fingerprint: string) {
    try {
      await registry.rotate(ctx, { ...request(), fingerprint });
      throw new Error("registration unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(TenantKeyRegistryError);
      const e = error as TenantKeyRegistryError;
      return { ...e, message: e.message };
    }
  }
  const invalid = await serviceRefusal(foreign, "malformed");
  expect(await serviceRefusal(foreign, a.fingerprint)).toEqual(invalid);
  expect(await serviceRefusal(context, a.fingerprint)).toEqual(invalid);
  expect(await snapshot(c.admin)).toEqual(before);
  const b = key();
  expect(await registry.rotate(context, { ...request(), fingerprint: b.fingerprint })).toBe(version + 1);
  expect(await registry.withKey(context, input(version + 1, b.fingerprint, "sign"), () => true)).toBe(true);
});

it("concurrent cross-tenant registration permits one owner and generically refuses the other", async () => {
  const registry = new SyntheticTenantKeyRegistry(owner, true), a = key();
  const results = await Promise.allSettled([context, foreign].map(ctx => registry.rotate(ctx, { ...request(), fingerprint: a.fingerprint })));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const refused = results.filter(r => r.status === "rejected");
  expect(refused).toHaveLength(1);
  expect((refused[0] as PromiseRejectedResult).reason).toEqual(new TenantKeyRegistryError());
  expect((await c.admin.query("SELECT count(*)::int n FROM app.tenant_key_version WHERE fingerprint=$1", [a.fingerprint])).rows[0].n).toBe(1);
});
