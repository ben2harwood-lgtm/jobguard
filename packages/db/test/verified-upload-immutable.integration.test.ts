// Real PostgreSQL tests; executed by CI, not in the restricted builder sandbox.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { asFixtureTenant, closeLockFixture, createLockFixture, seedAccount } from "./sv5pre-fixtures.js";

let f: Awaited<ReturnType<typeof createLockFixture>>;
let worker: Pool;
beforeAll(async () => {
  f = await createLockFixture();
  const login = `ls69_worker_${randomUUID().replaceAll("-", "")}`;
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${f.credential}'; GRANT jobguard_infrastructure TO ${login}`);
  worker = new Pool({ host: "127.0.0.1", port: f.port, database: "jobguard_synthetic_demo", user: login, password: f.credential, max: 1 });
  // Test-only definer deliberately supplies table authority to every product
  // caller. A privilege/RLS refusal alone would not prove the session-user guard.
  await f.admin.query(`CREATE FUNCTION app.ls69_test_upload_write(t uuid,u uuid,operation text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
    BEGIN
      CASE operation
        WHEN 'version' THEN UPDATE app.evidence_upload SET object_version_id='rewritten.v2' WHERE tenant_id=t AND id=u;
        WHEN 'timestamp' THEN UPDATE app.evidence_upload SET server_verified_at=clock_timestamp() WHERE tenant_id=t AND id=u;
        WHEN 'reject' THEN UPDATE app.evidence_upload SET state='rejected',rejection_code='TEST_REJECTED' WHERE tenant_id=t AND id=u;
        WHEN 'metadata' THEN UPDATE app.evidence_upload SET expires_at=expires_at+interval '1 day' WHERE tenant_id=t AND id=u;
        WHEN 'noop' THEN UPDATE app.evidence_upload SET state=state WHERE tenant_id=t AND id=u;
        ELSE RAISE EXCEPTION 'unknown test operation';
      END CASE;
      IF NOT FOUND THEN RAISE EXCEPTION 'test upload not found'; END IF;
    END $$;
    ALTER FUNCTION app.ls69_test_upload_write(uuid,uuid,text) OWNER TO jobguard_migration;
    REVOKE ALL ON FUNCTION app.ls69_test_upload_write(uuid,uuid,text) FROM PUBLIC;
    GRANT USAGE ON SCHEMA app TO jobguard_infrastructure;
    GRANT EXECUTE ON FUNCTION app.ls69_test_upload_write(uuid,uuid,text) TO jobguard_runtime,jobguard_shadow,jobguard_infrastructure`);
}, 120000);
afterAll(async () => { await worker?.end(); if (f) await closeLockFixture(f); });

async function upload() {
  const a = await seedAccount(f.admin), id = randomUUID();
  await asFixtureTenant(f.admin, a.tenantId, db => db.query(`INSERT INTO app.evidence_upload
    (id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at)
    VALUES($1,$2,$3,$4,$5,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day','verified','immutable.v1',clock_timestamp())`,
  [id, a.tenantId, a.jobId, a.scopeItemId, `ls69/${id}`]));
  return { ...a, id };
}

it.each(["runtime", "worker", "shadow"] as const)("refuses every verified-upload update from the %s session, including through a migration-owned routine", async role => {
  const a = await upload(), pool = role === "worker" ? worker : f[role];
  const snapshot = () => f.admin.query("SELECT to_jsonb(u)::text value FROM app.evidence_upload u WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.id]);
  const before = (await snapshot()).rows;
  expect((await pool.query("SELECT pg_has_role(session_user,'jobguard_migration','USAGE') maintenance")).rows).toEqual([{ maintenance: false }]);
  for (const operation of ["version", "timestamp", "reject", "metadata", "noop"]) {
    await expect(asFixtureTenant(pool, a.tenantId, db => db.query("SELECT app.ls69_test_upload_write($1,$2,$3)", [a.tenantId, a.id, operation])))
      .rejects.toMatchObject({ code: "42501", message: "verified evidence upload is immutable" });
    expect((await snapshot()).rows).toEqual(before);
  }
});

it("preserves inherited migration-login fixture writes without granting that authority to product sessions", async () => {
  const a = await upload();
  expect((await f.owner.query("SELECT pg_has_role(session_user,'jobguard_migration','USAGE') maintenance")).rows).toEqual([{ maintenance: true }]);
  const changed = await asFixtureTenant(f.owner, a.tenantId, db => db.query("UPDATE app.evidence_upload SET expires_at=expires_at+interval '1 day' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.id]));
  expect(changed.rowCount).toBe(1);
  // Identity remains immutable even to the maintenance path.
  await expect(asFixtureTenant(f.owner, a.tenantId, db => db.query("UPDATE app.evidence_upload SET object_key='rewritten' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.id])))
    .rejects.toMatchObject({ code: "42501" });
});
