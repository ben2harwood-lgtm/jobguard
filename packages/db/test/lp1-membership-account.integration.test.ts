// Preparatory requirements: intentionally fail on the preceding schema. Q1/Q3 remain HELD.
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

describe("LP-1 actual-role refusal requirements (implementation HELD)", () => {
  const phrase = randomUUID(), tenant = randomUUID(), foreign = randomUUID();
  const account = randomUUID(), otherAccount = randomUUID(), person = randomUUID(), otherPerson = randomUUID();
  const active = randomUUID(), revoked = randomUUID(), expired = randomUUID();
  let postgres: EmbeddedPostgres, owner: Pool, named: Pool, inherited: Pool;
  const runtimePools = () => [named, inherited];
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), "jg-lp1-authority-"));
    const port = await freePort(62500, 200);
    const options = { host: "127.0.0.1", port, database: "postgres", password: phrase };
    postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: phrase,
      persistent: false, createPostgresUser: process.getuid?.() === 0,
      initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
    await postgres.initialise(); await postgres.start();
    owner = new Pool({ ...options, user: "postgres" });
    await migrate(owner);
    // Separately authenticated owner setup, never a runtime connection elevated to migration.
    await owner.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenant, foreign]);
    await owner.query("INSERT INTO identity.identity_user(id) VALUES($1),($2)", [person, otherPerson]);
    await owner.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'LP1 generated account'),($3,$4,'LP1 foreign account')",
      [account, tenant, otherAccount, foreign]);
    for (const [id, state] of [[active, "active"], [revoked, "revoked"], [expired, "expired"]] as const) {
      await owner.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role,revoked_at,expires_at)
        VALUES($1,$2,$3,$4,'member',CASE WHEN $5='revoked' THEN transaction_timestamp()-interval '1 day' END,
        CASE WHEN $5='expired' THEN transaction_timestamp()-interval '1 day' END)`, [id, tenant, account, person, state]);
    }
    // Existing-role LOGIN is fixture configuration, with no new object privilege.
    await owner.query(`ALTER ROLE jobguard_runtime LOGIN PASSWORD '${phrase}'`);
    await owner.query(`CREATE ROLE lp1_inherited_login LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${phrase}'`);
    await owner.query("GRANT jobguard_runtime TO lp1_inherited_login");
    named = new Pool({ ...options, user: "jobguard_runtime", max: 1 });
    inherited = new Pool({ ...options, user: "lp1_inherited_login", max: 1 });
  }, 60_000);
  afterAll(async () => { await closeTestPools(named, inherited, owner); await postgres?.stop(); });

  const columns: Record<string, string> = {
    "app.account": "id,tenant_id,name,created_at,updated_at",
    "app.membership": "id,tenant_id,account_id,identity_user_id,role,created_at,revoked_at,expires_at",
    "control_plane.tenant": "id,created_at",
    "identity.identity_user": "id,created_at",
    "app.command_receipt": "command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at",
    "app.audit_event": "id,tenant_id,sequence,event_hash,payload_hash,previous_hash,occurred_at",
    "audit_control.audit_head": "tenant_id,sequence,event_hash",
  };
  async function persisted() {
    // A fresh connection observes committed state, including precise timestamp text.
    const client = await owner.connect();
    try {
      const result: Record<string, string[]> = {};
      for (const [table, names] of Object.entries(columns)) {
        result[table] = (await client.query(`SELECT row_to_json(t)::text AS bytes FROM
          (SELECT ${names} FROM ${table}) t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows.map(row => row.bytes as string);
      }
      return result;
    } finally { client.release(); }
  }
  async function refused(pool: Pool, sql: string, values: unknown[] = [], context: string | null = tenant) {
    const before = await persisted();
    const client = await pool.connect();
    let failure: unknown;
    try {
      await client.query("BEGIN");
      if (context !== null) await client.query("SELECT set_config('app.tenant_id',$1,true)", [context]);
      try { await client.query(sql, values); } catch (error) { failure = error; }
      // COMMIT an aborted transaction proves the refusal cannot persist earlier statement effects.
      if (failure) await client.query("COMMIT"); else await client.query("ROLLBACK");
    } finally { await client.query("ROLLBACK"); client.release(); }
    expect(await persisted(), sql).toEqual(before);
    expect(failure, sql).toMatchObject({ code: "42501" });
  }

  it("[LP1-01] runtime cannot create or replace account or membership authority", async () => {
    expect((await owner.query("SELECT id FROM app.account WHERE id=$1", [account])).rowCount).toBe(1);
    for (const pool of runtimePools()) {
      for (const target of [tenant, foreign]) {
        await refused(pool, "INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Generated replacement')", [randomUUID(), target]);
        await refused(pool, "INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
          [randomUUID(), target, target === tenant ? account : otherAccount, person]);
      }
      await refused(pool, "INSERT INTO app.account(id,tenant_id,name) SELECT $1,tenant_id,name FROM app.account WHERE id=$2", [randomUUID(), account]);
      await refused(pool, `INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
        SELECT $1,tenant_id,account_id,identity_user_id,'owner' FROM app.membership WHERE id=$2`, [randomUUID(), revoked]);
      await refused(pool, `INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Replacement')
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name`, [account, tenant]);
      await refused(pool, `INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')
        ON CONFLICT(tenant_id,id) DO UPDATE SET revoked_at=NULL,expires_at=NULL,role='owner'`, [revoked, tenant, account, person]);
    }
  });

  it("[LP1-02] runtime cannot promote, restore, relink or delete authority", async () => {
    const updates = [
      ["app.account", account, "id=gen_random_uuid()"], ["app.account", account, "tenant_id='" + foreign + "'"],
      ["app.account", account, "name='Changed'"], ["app.account", account, "created_at=created_at+interval '1 microsecond'"],
      ["app.account", account, "updated_at=updated_at+interval '1 microsecond'"],
      ["app.membership", active, "id=gen_random_uuid()"], ["app.membership", active, "tenant_id='" + foreign + "'"],
      ["app.membership", active, "account_id='" + otherAccount + "'"], ["app.membership", active, "identity_user_id='" + otherPerson + "'"],
      ["app.membership", active, "role='owner'"], ["app.membership", active, "revoked_at=clock_timestamp()"],
      ["app.membership", active, "expires_at=clock_timestamp()+interval '1 day'"],
      ["app.membership", revoked, "revoked_at=NULL"], ["app.membership", revoked, "revoked_at=revoked_at+interval '1 day'"],
      ["app.membership", expired, "expires_at=NULL"], ["app.membership", expired, "expires_at=clock_timestamp()+interval '1 year'"],
    ];
    for (const pool of runtimePools()) {
      for (const [table, id, assignment] of updates) await refused(pool, `UPDATE ${table} SET ${assignment} WHERE id=$1`, [id]);
      for (const table of ["app.account", "app.membership"]) {
        await refused(pool, `DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
        await refused(pool, `TRUNCATE ${table} CASCADE`);
      }
    }
  });

  it("[LP1-03] refused writes leave persisted rows and linked effects unchanged", async () => {
    for (const pool of runtimePools()) {
      await refused(pool, "UPDATE app.account SET name='Invalid authority' WHERE id=$1", [account]);
      await refused(pool, "UPDATE app.membership SET revoked_at=NULL WHERE id=$1", [revoked]);
      const client = await pool.connect();
      try {
        await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
        expect((await client.query("SELECT id FROM app.account WHERE id=$1", [account])).rowCount).toBe(1);
        expect((await client.query("SELECT id FROM app.membership WHERE id=$1", [active])).rowCount).toBe(1);
        await client.query("COMMIT");
      } finally { await client.query("ROLLBACK"); client.release(); }
      for (const context of [null, "invalid", foreign]) {
        await refused(pool, "INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Invalid context')", [randomUUID(), tenant], context);
      }
    }
  });

  it("[LP1-04] effective privileges expose only reads and immutable locking columns", async () => {
    for (const role of ["jobguard_runtime", "lp1_inherited_login"]) {
      const posture = (await owner.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=$1", [role])).rows;
      expect(posture).toEqual([{ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false }]);
      for (const table of ["app.account", "app.membership"]) {
        for (const permission of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
          expect((await owner.query("SELECT has_table_privilege($1,$2,$3) AS allowed", [role, table, permission])).rows).toEqual([{ allowed: false }]);
        }
        const grants = (await owner.query(`SELECT a.attname AS name,has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS writable,
          has_column_privilege($1,c.oid,a.attnum,'UPDATE WITH GRANT OPTION') AS delegable
          FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
          WHERE c.oid=$2::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname`, [role, table])).rows;
        expect(grants.filter(row => row.writable).map(row => row.name)).toEqual(["created_at"]);
        expect(grants.every(row => !row.delegable)).toBe(true);
        expect((await owner.query("SELECT has_table_privilege($1,$2,'SELECT') AS allowed", [role, table])).rows).toEqual([{ allowed: true }]);
      }
    }
    for (const pool of runtimePools()) {
      for (const role of ["jobguard_migration", "jobguard_identity", "jobguard_infrastructure"]) await refused(pool, `SET ROLE ${role}`);
      // The inherited login may SET ROLE runtime, but gains no authority that way.
      const client = await inherited.connect();
      try {
        await client.query("BEGIN"); await client.query("SET LOCAL ROLE jobguard_runtime");
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
        await expect(client.query("DELETE FROM app.account WHERE id=$1", [account])).rejects.toMatchObject({ code: "42501" });
      } finally { await client.query("ROLLBACK"); client.release(); }
    }
  });

  it("[LP1-05] the retained column grant permits no update or side effect", async () => {
    for (const pool of runtimePools()) {
      for (const table of ["app.account", "app.membership"]) {
        for (const expression of ["created_at", "created_at+interval '1 microsecond'"]) {
          await refused(pool, `UPDATE ${table} SET created_at=${expression} WHERE tenant_id=$1`, [tenant]);
        }
        await refused(pool, `ALTER TABLE ${table} DISABLE TRIGGER USER`);
        await refused(pool, `ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
      }
      await refused(pool, "SELECT app.lp1_reject_lock_column_update()");
    }
    // Install a rolled-back AFTER trigger as an owner-side control. No grants or fixture role added.
    const setup: PoolClient = await owner.connect();
    try {
      await setup.query("BEGIN");
      await setup.query("CREATE TABLE public.lp1_update_effect(id uuid)");
      await setup.query(`CREATE FUNCTION public.lp1_update_effect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
        SET search_path=pg_catalog AS $$ BEGIN INSERT INTO public.lp1_update_effect VALUES(NEW.id); RETURN NEW; END $$`);
      await setup.query("REVOKE ALL ON FUNCTION public.lp1_update_effect() FROM PUBLIC");
      await setup.query(`CREATE TRIGGER zzz_lp1_update_effect AFTER UPDATE ON app.account FOR EACH ROW EXECUTE FUNCTION public.lp1_update_effect()`);
      await setup.query("SAVEPOINT refusal");
      await setup.query("SET LOCAL ROLE jobguard_runtime");
      await setup.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
      await expect(setup.query("UPDATE app.account SET created_at=created_at WHERE tenant_id=$1", [tenant])).rejects.toMatchObject({ code: "42501" });
      await setup.query("ROLLBACK TO SAVEPOINT refusal");
      expect((await setup.query("SELECT count(*)::int AS count FROM public.lp1_update_effect")).rows).toEqual([{ count: 0 }]);
    } finally { await setup.query("ROLLBACK"); setup.release(); }
  });
});
