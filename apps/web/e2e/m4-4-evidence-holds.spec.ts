import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
// Native import preserves the built ESM context stamp and avoids Playwright's source loader.
const loadDb = () => (new Function("specifier", "return import(specifier)") as (s: string) => Promise<typeof import("@jobguard/db")>)(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
const adminUrl = "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo";
const runtimeUrl = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
test("owners request holds, see stored applied states, and a different person requests release", async ({ page, context }) => {
  test.setTimeout(90000);
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const db = await loadDb();
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
  const role = `hold_e2e_${randomUUID().replaceAll("-", "")}`;
  let executor: Pool | undefined;
  try {
    const tenant = randomUUID(), account = randomUUID(), job = randomUUID(), evidence = randomUUID();
    const sessions = [randomUUID(), randomUUID()], members = [randomUUID(), randomUUID()];
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional hold owners')", [account, tenant]);
    for (let n = 0; n < 2; n++) {
      const user = randomUUID();
      await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
      await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [members[n], tenant, account, user]);
      await admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,now(),now()+interval '1 day')`, [randomUUID(), tenant, members[n], user, createHash("sha256").update(sessions[n]!).digest("hex")]);
    }
    const verified = await db.contractorSessionContext(runtime, sessions[0]!);
    await new db.JobRepository(runtime).create(verified, ["job:update"], { id: job, title: "Fictional evidence hold" });
    const key = `synthetic/tenants/${tenant}/manifest`;
    await admin.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
      VALUES($1,$2,$3,$4,$5,'application/json',100,'standard_evidence',now()+interval '1 day')`, [evidence, tenant, job, key, "a".repeat(64)]);
    await admin.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2,$1,$3,'original','manifest',$4,'v1',$5,2,'application/json','standard_evidence',now(),now())`, [evidence, tenant, job, key, "a".repeat(64)]);
    await admin.query("INSERT INTO app.worm_synthetic_version VALUES($1,$2,$3)", [tenant, evidence, job]);
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD 'fictional-executor' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`);
    await admin.query(`GRANT jobguard_worm_executor TO ${role}`);
    executor = new Pool({ connectionString: `postgresql://${role}:fictional-executor@127.0.0.1:55432/jobguard_synthetic_demo`, max: 1 });
    const repository = new db.WormCommandRepository(runtime, true, executor);
    let held = false;
    const storage = { retain: async () => undefined, hold: async (_target: unknown, value: boolean) => { held = value; }, read: async () => ({ held, retainUntil: null }) };
    const tsa = { anchor: async () => ({ status: "pending" as const, reason: "service_unavailable" as const }) };
    await context.addCookies([{ name: "jg_session", value: sessions[0]!, url: "http://127.0.0.1:3000" }]);
    await page.goto(`/jobs/${job}/evidence-holds`);
    const main = page.getByRole("main");
    await main.getByLabel("Synthetic evidence").selectOption(evidence);
    await main.getByRole("button", { name: "Request hold", exact: true }).click();
    await expect(main.getByRole("status")).toHaveText("Hold requested");
    await expect(main.getByText("No applied hold is confirmed.", { exact: true })).toBeVisible();
    await page.reload(); await main.getByLabel("Synthetic evidence").selectOption(evidence);
    await expect(main.getByText("Hold requested", { exact: true })).toBeVisible();
    expect(held).toBe(false);
    const commands = (await admin.query("SELECT id FROM app.worm_command WHERE tenant_id=$1 AND action='apply_hold'", [tenant])).rows;
    expect(commands).toHaveLength(1);
    await repository.execute(verified, commands[0].id, storage, tsa);
    await main.getByRole("button", { name: "Refresh status" }).click();
    await expect(main.getByText("Stored hold is applied.", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Request release" })).toBeDisabled();
    await context.addCookies([{ name: "jg_session", value: sessions[1]!, url: "http://127.0.0.1:3000" }]);
    await page.reload(); await main.getByLabel("Synthetic evidence").selectOption(evidence);
    await main.getByRole("button", { name: "Request release" }).click();
    await expect(main.getByRole("status")).toHaveText("Release requested");
    await expect(main.getByText("Stored hold is applied.", { exact: true })).toBeVisible();
    const release = (await admin.query("SELECT id FROM app.worm_command WHERE tenant_id=$1 AND action='release_hold'", [tenant])).rows[0];
    await repository.execute(verified, release.id, storage, tsa);
    await main.getByRole("button", { name: "Refresh status" }).click();
    await expect(main.getByText("Hold released", { exact: true })).toBeVisible();
    expect(held).toBe(false);
    expect((await admin.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND id=$2", [tenant, evidence])).rows).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const button of await main.getByRole("button").all()) {
      const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  } finally { await Promise.all([admin.end(), runtime.end(), executor?.end()]); }
});

for (const uncertainStatus of [403, 503]) test(`an uncertain ${uncertainStatus} response retains the exact command across reload and retries`, async ({ page }) => {
  const job = randomUUID(), evidenceId = randomUUID();
  const requests: unknown[] = [];
  await page.route(`**/api/jobs/${job}/evidence-holds`, async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { items: [{ evidenceId, label: "manifest", held: false, canApply: true, canRelease: false, message: "No hold requested" }] } });
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: requests.length === 1 ? uncertainStatus : 201, json: { message: requests.length === 1 ? "Retry the same request." : "Hold requested" } });
  });
  await page.goto(`/jobs/${job}/evidence-holds`);
  const main = page.getByRole("main");
  await main.getByLabel("Synthetic evidence").selectOption(evidenceId);
  await main.getByRole("button", { name: "Request hold", exact: true }).click();
  await expect(main.getByRole("button", { name: "Retry same request" })).toBeEnabled();
  await page.reload();
  await main.getByRole("button", { name: "Retry same request" }).click();
  await expect(main.getByRole("status")).toHaveText("Hold requested");
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
