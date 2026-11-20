import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { UserCommandDispatcher } from "../src/commands.js";
import { AdoptInFlightJobMutation } from "../src/job-import-repository.js";
import { adoptionFixture, jobDoorCounts, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { workerFixturePool } from "./worker-login-fixture.js";
import { lp12Owners } from "./lp12-narrow-owners.js";
import { gateContext, gateMigrationEvidence, gatePrincipal, gateRefusal } from "./lp9-final-gate-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); db = await jobDoorsDatabase(true); }, 300_000);
afterAll(async () => { await db?.close(); vi.unstubAllEnvs(); });

it("records actual isolated service identities, disjoint memberships and effective grants after the complete LP chain", async () => {
  await db.owner.query(`CREATE ROLE lp9_identity LOGIN PASSWORD 'synthetic-identity-only'
    INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT jobguard_identity TO lp9_identity`);
  const identity = new Pool({ ...db.runtime.options, user: "lp9_identity", password: "synthetic-identity-only", max: 1 });
  const worker = await workerFixturePool(db.owner);
  try {
    const observations = [];
    for (const [pool, login, role] of [[db.runtime, "lp2_login", "jobguard_runtime"],
      [identity, "lp9_identity", "jobguard_identity"], [worker, "lp10_fixture_worker", "jobguard_worker"]] as const) {
      const observed = (await pool.query(`SELECT session_user,current_user,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
        FROM pg_roles WHERE rolname=current_user`)).rows[0];
      expect(observed).toEqual({ session_user: login, current_user: login, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false });
      const memberships = (await pool.query(`SELECT rolname FROM pg_roles
        WHERE rolname LIKE 'jobguard_%' AND pg_has_role(current_user,oid,'MEMBER') ORDER BY rolname`)).rows;
      expect(memberships).toEqual([{ rolname: role }]);
      const grants = (await db.owner.query(`SELECT
        has_function_privilege($1,'app.bind_request(text,text,uuid)','EXECUTE') request,
        has_function_privilege($1,'app.claim_worker_action(uuid,text[])','EXECUTE') worker,
        has_table_privilege($1,'identity.session','SELECT') identity`, [login])).rows[0];
      expect(grants).toEqual({ request: role === "jobguard_runtime", worker: role === "jobguard_worker", identity: role === "jobguard_identity" });
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        for (const owner of ["jobguard_migration", ...lp12Owners]) await gateRefusal(c, `SET ROLE ${owner}`);
        await c.query("COMMIT");
      } finally { await c.query("ROLLBACK"); c.release(); }
      observations.push({ ...observed, memberships, grants });
    }
    // A real identity login can read its fixture session; runtime and worker cannot.
    const p = await gatePrincipal(db.owner);
    expect((await identity.query("SELECT id FROM identity.session WHERE id=$1", [p.sessionId])).rows).toEqual([{ id: p.sessionId }]);
    console.info("LP-9 synthetic version/role evidence", {
      applicationCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      postgres: (await db.owner.query("SHOW server_version")).rows[0].server_version,
      migrations: await gateMigrationEvidence(db.owner), observations,
    });
  } finally { await identity.end(); }
});

it.each(["COMMIT", "ROLLBACK"] as const)("releases and reacquires the same backend after %s, then commits a legitimate adoption without stale actor authority", async finish => {
  const f = await adoptionFixture(db), p = await gatePrincipal(db.owner, f.actor), other = await gatePrincipal(db.owner);
  const pool = db.freshRuntime(), before = await jobDoorCounts(db.owner, p.tenant);
  let pid: number;
  try {
    const c = await pool.connect();
    try {
      pid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      await c.query("BEGIN");
      await c.query("SELECT app.bind_request('real',$1,$2)", [p.credential, p.tenant]);
      expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(p.member);
      await c.query(finish);
    } finally { await c.query("ROLLBACK"); c.release(); }
    const reused = await pool.connect();
    try {
      expect((await reused.query("SELECT pg_backend_pid() pid")).rows[0].pid).toBe(pid!);
      await reused.query("BEGIN");
      await reused.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)", [p.tenant, p.member]);
      for (const fn of ["current_actor", "current_tenant"]) await gateRefusal(reused, `SELECT app.${fn}()`, [], "REQUEST_BINDING_REFUSED");
      await reused.query("SELECT app.bind_request('real',$1,$2)", [other.credential, other.tenant]);
      expect((await reused.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows[0]).toEqual({ actor: other.member, tenant: other.tenant });
      expect((await reused.query("SELECT id FROM app.job WHERE id=$1", [f.input.jobId])).rows).toEqual([]);
      await reused.query("COMMIT");
    } finally { await reused.query("ROLLBACK"); reused.release(); }
    expect(await jobDoorCounts(db.owner, p.tenant)).toEqual(before);
    const dispatcher = new UserCommandDispatcher(pool);
    const mutation = new AdoptInFlightJobMutation(p.tenant, "synthetic_candidate", f.input);
    const result = await dispatcher.dispatch(gateContext(p), f.command, mutation);
    expect(result).toMatchObject({ jobId: f.input.jobId, baselineId: f.input.baselineId });
    const committed = await jobDoorCounts(db.owner, p.tenant);
    expect(committed.job).toBe(before.job! + 1);
    expect(committed.imported_job_baseline).toBe(before.imported_job_baseline! + 1);
    expect((await db.owner.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [p.tenant, f.command.commandId])).rows).toEqual([{ status: "succeeded" }]);
    expect(await dispatcher.dispatch(gateContext(p), f.command, { mutate: async () => { throw new Error("LP9_REPLAY_MUTATED"); } })).toEqual(result);
    expect(await jobDoorCounts(db.owner, p.tenant)).toEqual(committed);
  } finally { await pool.end(); }
});

it("rotates only the disposable login, demonstrates the already-open pool, and drains it before reconnecting", async () => {
  // Enforce password authentication on this generated cluster only. Embedded
  // fixtures may otherwise use trust, which cannot prove credential rotation.
  const hba = join(db.directory, "pg_hba.conf"), original = await readFile(hba, "utf8");
  const pool = db.freshRuntime(), rotated = randomUUID();
  pool.on("error", () => undefined); // pg reports the expected operator termination on an idle client.
  let fresh: Pool | undefined;
  try {
    const pid = (await pool.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    await writeFile(hba, `host all lp2_login 127.0.0.1/32 scram-sha-256\n${original}`);
    const loaded = (await db.owner.query("SELECT pg_conf_load_time()::text loaded")).rows[0].loaded;
    await db.owner.query("SELECT pg_reload_conf()");
    await vi.waitFor(async () => {
      expect((await db.owner.query("SELECT pg_conf_load_time()::text loaded")).rows[0].loaded).not.toBe(loaded);
    }, { timeout: 5000, interval: 25 });
    expect((await db.owner.query("SELECT error FROM pg_hba_file_rules WHERE error IS NOT NULL")).rows).toEqual([]);
    await db.owner.query(`SET password_encryption='scram-sha-256'; ALTER ROLE lp2_login PASSWORD '${rotated}'`);
    expect((await pool.query("SELECT pg_backend_pid() pid")).rows[0].pid).toBe(pid);
    fresh = new Pool({ ...db.runtime.options, password: rotated, max: 1 });
    // A newly authenticated connection proves the reloaded rule is in effect.
    expect((await fresh.query("SELECT session_user login")).rows[0].login).toBe("lp2_login");
    const stale = db.freshRuntime();
    try { await expect(stale.query("SELECT 1")).rejects.toMatchObject({ code: "28P01" }); }
    finally { await stale.end(); }
    await db.owner.query("SELECT pg_terminate_backend($1)", [pid]);
    await vi.waitFor(() => { expect(pool.totalCount).toBe(0); }, { timeout: 5000, interval: 25 });
    await expect(pool.query("SELECT 1")).rejects.toMatchObject({ code: "28P01" });
    const p = await gatePrincipal(db.owner), c = await fresh.connect();
    try {
      await c.query("BEGIN"); await gateRefusal(c, "SELECT app.current_actor()", [], "REQUEST_BINDING_REFUSED");
      await c.query("SELECT app.bind_request('real',$1,$2)", [p.credential, p.tenant]);
      expect((await c.query("SELECT app.current_actor() actor")).rows[0].actor).toBe(p.member);
      await c.query("COMMIT");
    } finally { await c.query("ROLLBACK"); c.release(); }
  } finally {
    await writeFile(hba, original); await db.owner.query("SELECT pg_reload_conf()");
    // Restore the generated fixture password, never any account outside this cluster.
    await db.owner.query(`ALTER ROLE lp2_login PASSWORD '${String(db.runtime.options.password)}'`);
    await pool.end(); await fresh?.end();
  }
});
