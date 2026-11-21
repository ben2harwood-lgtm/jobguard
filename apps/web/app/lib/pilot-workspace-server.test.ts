import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migrate } from "@jobguard/db";
import { closeTestDatabase, freePort, installAuditCommandWriterRoles } from "../../../../packages/db/test/pool-test-utils.js";
import { pilotApprovalFixture, unavailablePilotApproval, unavailablePilotApprovals } from "../../../../packages/config/src/policy-gates.pilot-test-fixture.js";
import { GET } from "../api/jobs/route";

const { cookieJar, blockedPractice } = vi.hoisted(() => ({ cookieJar: new Map<string, { value: string }>(), blockedPractice: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));
vi.mock("./synthetic-server", () => ({
  hasSyntheticSession: (...args: unknown[]) => blockedPractice(...args),
  syntheticWorkspace: (...args: unknown[]) => blockedPractice(...args),
}));
vi.mock("./workspace-server", () => ({ workspaceApplication: (...args: unknown[]) => blockedPractice(...args) }));

import { closeIdentityApplication } from "./identity-server";

const origin = "https://boundary.invalid";
const secret = "fictional identity boundary signing fixture";
const credential = randomUUID();
const csrf = "fictional-boundary-csrf-token";
const tenantA = randomUUID(), tenantB = randomUUID(), jobA = randomUUID(), jobB = randomUUID();
const practiceJob = randomUUID(), contractorJob = randomUUID(), practiceSession = "s".repeat(43), memberSession = "m".repeat(43);
const member = randomUUID();
let admin: Pool, postgres: EmbeddedPostgres, directory: string, port: number;
const url = (user: string) => `postgresql://${user}:${credential}@127.0.0.1:${port}/postgres`;
function configure(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}
function request(tenantId = tenantA, jobId?: string, tenantHeader?: string) {
  const query = new URLSearchParams({ tenantId });
  if (jobId) query.set("jobId", jobId);
  return GET(new NextRequest(`${origin}/api/jobs?${query}`, {
    headers: { origin, "x-csrf-token": csrf, ...(tenantHeader ? { "x-tenant-id": tenantHeader } : {}) },
  }));
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-pilot-boundary-"));
  port = await freePort(57200, 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: true,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ connectionString: url("postgres") });
  await installAuditCommandWriterRoles(admin);
  await migrate(admin);
  for (const role of ["jobguard_runtime", "jobguard_identity"]) {
    await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${credential}'`);
  }

  const user = randomUUID(), account = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES('boundary@fictional.invalid',$1)", [user]);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenantA, tenantB]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES ($1,$2,'Fictional account')", [account, tenantA]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES ($1,$2,$3,$4,'owner')", [member, tenantA, account, user]);
  await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenantA, member]);
  for (const [environment, sessionToken] of [["pilot_no_charge", memberSession], ["synthetic_demo", practiceSession]]) {
    const digest = createHmac("sha256", secret).update(`session:${sessionToken}`).digest("hex");
    await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour')", [randomUUID(),user,environment,digest,csrf]);
  }
  for (const [tenant, job, track, environment] of [
    [tenantA, jobA, "small_builder", "pilot_no_charge"],
    [tenantB, jobB, "small_builder", "pilot_no_charge"],
    [tenantA, practiceJob, "small_builder", "synthetic_demo"],
    [tenantA, contractorJob, "contractor", "synthetic_demo"],
  ]) {
    await admin.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional job')", [tenant,job]);
    await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,$3,$4,'quote_activation')", [tenant,job,track,environment]);
  }
  configure({
    ...pilotApprovalFixture().env,
    JOBGUARD_HOSTING: "cloudflare", // Single-use runtime connections.
    PILOT_RUNTIME_DATABASE_URL: url("jobguard_runtime"),
    IDENTITY_DATABASE_URL: url("jobguard_identity"),
    AUTH_CODE_SECRET: secret,
    AUTH_ALLOWED_ORIGIN: origin,
  });
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await closeIdentityApplication();
  if (postgres) await closeTestDatabase(postgres, directory, admin);
});

it("lists only the verified member's pilot jobs through the Next route and gives no practice fallback", async () => {
  cookieJar.set("jobguard_session", { value: memberSession });
  const result = await request();
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(await result.json()).toMatchObject({ tenantId: tenantA, jobs: [{ id: jobA, tenantId: tenantA, pilotNoCharge: true }] });
  expect((await request(tenantA, jobA)).status).toBe(200);
  for (const foreignId of [jobB, practiceJob, contractorJob]) expect((await request(tenantA, foreignId)).status).toBe(404);
  expect((await request(tenantB)).status).toBe(403);
  expect((await request(tenantA, undefined, tenantB)).status).toBe(403);
  expect(blockedPractice).not.toHaveBeenCalled();
});

it("rejects practice cookies, synthetic persisted sessions, and privileged runtime configuration", async () => {
  cookieJar.set("jobguard_session", { value: memberSession });
  cookieJar.set("jg_session", { value: practiceSession });
  expect((await request()).status).toBe(401);
  cookieJar.delete("jg_session");
  cookieJar.set("jobguard_session", { value: practiceSession });
  expect((await request()).status).toBe(401);
  cookieJar.set("jobguard_session", { value: memberSession });
  vi.stubEnv("PILOT_RUNTIME_DATABASE_URL", url("postgres"));
  expect((await request()).status).toBe(503);
  vi.stubEnv("PILOT_RUNTIME_DATABASE_URL", url("jobguard_runtime"));
  expect(blockedPractice).not.toHaveBeenCalled();
});

it.each(unavailablePilotApprovals)("refuses the request when PILOT-21 evidence is %s", async (_name, value) => {
  configure(unavailablePilotApproval(value));
  cookieJar.set("jobguard_session", { value: memberSession });
  const result = await request();
  expect(result.status).toBe(403);
  expect(await result.json()).toEqual({ code: "PILOT_G1_CLOSED" });
  expect(blockedPractice).not.toHaveBeenCalled();
});

it("refuses a revoked membership at the same boundary", async () => {
  configure(pilotApprovalFixture().env);
  await admin.query("UPDATE app.membership SET revoked_at=now() WHERE tenant_id=$1 AND id=$2", [tenantA, member]);
  cookieJar.set("jobguard_session", { value: memberSession });
  expect((await request()).status).toBe(403);
});
