import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID,
 authenticatePracticeSession, issuePracticeSession, migrate } from "../src/index.js";
import { ValueV3Reader } from "../src/value-v3-reader.js";
import { ValueV3Application } from "../../../apps/api/src/value/value-v3.application.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

// Required CI ONLY. Real PostgreSQL/current practice authority, not a producer
// reconciliation test: real SV-6/MON-1 command/source bindings remain HELD.
let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, directory: string;
let session: string, stranger: string, jobId: string;
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 directory = await mkdtemp(join(tmpdir(), "jobguard-value-v3-"));
 const port = await freePort(58000, 500);
 postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
  createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start();await postgres.createDatabase("jobguard_synthetic_demo");
 admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
 await migrate(admin);
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional CH9-J boundary')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
 await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS");
 runtime = new Pool({ host: "127.0.0.1", port, user: "jobguard_runtime", password: "synthetic", database: "jobguard_synthetic_demo" });
 session = await issuePracticeSession(runtime); stranger = await issuePracticeSession(runtime);
 const auth = await authenticatePracticeSession(runtime, session);
 jobId = (await admin.query<{ id: string }>("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live' AND practice_scenario='home'", [DEMO_TENANT_ID, auth.digest])).rows[0]!.id;
}, 60_000);
afterAll(async () => {
 vi.unstubAllEnvs(); await closeTestPools(runtime, admin); await postgres?.stop();
 if (directory) await rm(directory, { recursive: true, force: true });
});
it("CH9-J01/02 current authority protects direct reader and application paths", async () => {
 const reader = new ValueV3Reader(runtime, session);
 expect(await reader.readJob(jobId)).toMatchObject({ jobId, status: "incomplete" });
 for (const denied of [new ValueV3Reader(runtime, stranger), new ValueV3Reader(runtime)]) {
  await expect(denied.readJob(jobId)).rejects.toHaveProperty("code");
 }
 await expect(reader.readJob(randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(new ValueV3Application(runtime, stranger, reader).readJob(jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("CH9-J03/05/07/09 never calls held producers, emits source identities, allocates subscription or changes business state", async () => {
 const readAuthorisedSnapshot = vi.fn(async () => { throw new Error("Held producer must never execute"); });
 const reader = new ValueV3Reader(runtime, session, { sources: { binding: "HELD", reason: "H-VALUE-SOURCES", readAuthorisedSnapshot } });
 const app = new ValueV3Application(runtime, session, reader);
 // Row bytes across ALL app business tables, not selected count-only evidence.
 const snapshot = async () => {
  const tables = (await admin.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows;
  const data: unknown[] = [];
  for (const { tablename } of tables) {
   if (!/^[a-z_][a-z_0-9]*$/.test(tablename)) throw new Error("Unexpected catalog name");
   data.push([tablename, (await admin.query(`SELECT COALESCE(jsonb_agg(record ORDER BY record::text),'[]'::jsonb) snapshot FROM (SELECT to_jsonb(t) record FROM app."${tablename}" t) s`)).rows[0]!.snapshot]);
  }
  return data;
 };
 const before = await snapshot();
 const first = await app.readJob(jobId);
 expect(await app.readJob(jobId)).toEqual(first);
 expect(first).toEqual({ version: "job-value.v3", environment: "synthetic_demo", jobId, status: "incomplete", reason: "producer_bindings_held",
  producers: { sources: "HELD", derivation: "HELD", subscription: "HELD", postedMoney: "HELD" }, asOf: null, receipt: null });
 expect(readAuthorisedSnapshot).not.toHaveBeenCalled();
 expect(await snapshot()).toEqual(before);
});
