import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, issuePracticeSession, migrate } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { BusinessValueApplication } from "../../../apps/api/src/value/value-business.controller.js";

// CI ONLY. Refusal/real-authentication proof; not a command-created money trace.
let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 directory = await mkdtemp(join(tmpdir(), "ch9-b-pg-"));
 const port = await freePort(57000, 500);
 postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start();await postgres.createDatabase("jobguard_synthetic_demo");
 admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
 await migrate(admin);
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional CH9-B refusal test')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
 await admin.query("CREATE ROLE ch9b_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO ch9b_login");
 runtime = new Pool({ host: "127.0.0.1", port, user: "ch9b_login", password: "synthetic", database: "jobguard_synthetic_demo" });
}, 60_000);
afterAll(async () => {
 vi.unstubAllEnvs(); await closeTestPools(runtime, admin); await postgres?.stop();
 if (directory) await rm(directory, { recursive: true, force: true });
});
async function businessRows() {
 // Disposable administrative observer only; the product never opens these reads.
 const tables = (await admin.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows;
 const result: Record<string, unknown> = {};
 for (const { tablename } of tables) {
  const identifier = `"${tablename.replaceAll('"', '""')}"`;
  result[tablename] = (await admin.query(`SELECT to_jsonb(t)::text AS row FROM app.${identifier} t ORDER BY to_jsonb(t)::text COLLATE "C"`)).rows;
 }
 return result;
}
it("CH9-B01/B02/B05/B06/B09/B11/B12 authenticated shared sessions remain unavailable with every business row unchanged", async () => {
 const first = await issuePracticeSession(runtime), second = await issuePracticeSession(runtime);
 const before = await businessRows();
 for (const token of [first, second, first]) {
  expect(await new BusinessValueApplication(runtime, token).readBusiness({})).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "BUSINESS_VALUE_BINDING_HELD" });
 }
 expect(await businessRows()).toEqual(before);
});
it("CH9-B03/B04/B07 no unknown period becomes current dates, zero charge or complete source vector", async () => {
 const app = new BusinessValueApplication(runtime, await issuePracticeSession(runtime));
 expect(await app.readBusiness({ periodId: randomUUID() })).toMatchObject({ code: "BUSINESS_VALUE_SELECTION_HELD" });
 expect(await app.readBusiness({ count: 0, tenantId: DEMO_TENANT_ID })).toMatchObject({ code: "INVALID_BUSINESS_VALUE_SELECTION" });
});
it("CH9-B07/B08 genuine replay rechecks revocation before selection or held-state detail", async () => {
 const token = await issuePracticeSession(runtime), app = new BusinessValueApplication(runtime, token);
 await app.readBusiness({});
 await admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [createHash("sha256").update(token).digest("hex")]);
 await expect(app.readBusiness({ tenantId: randomUUID() })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 await expect(new BusinessValueApplication(runtime, randomUUID()).readBusiness({})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
