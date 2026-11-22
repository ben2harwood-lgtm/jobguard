import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { pilotApprovalFixture } from "../../../packages/config/src/policy-gates.pilot-test-fixture";
import { closeTestDatabase, freePort, installAuditCommandWriterRoles } from "../../../packages/db/test/pool-test-utils";

const hostname = "pilot-browser.invalid";
const fixtureDatabase = "jobguard_pilot_browser";
const tenant = randomUUID(), other = randomUUID(), sessionToken = randomBytes(32).toString("base64url");
let origin: string, directory: string, database: EmbeddedPostgres, admin: Pool;
let server: ChildProcess | undefined;

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jobguard-pilot-browser-"));
  const dbPort = await freePort(57300, 100), port = await freePort(57500, 100);
  origin = `https://${hostname}:${port}`;
  const adminPassword = randomUUID(), runtimePassword = randomUUID(), identityPassword = randomUUID();
  const url = (user: string, password: string) => `postgresql://${user}:${password}@127.0.0.1:${dbPort}/${fixtureDatabase}`;
  database = new EmbeddedPostgres({ databaseDir: join(directory, "db"), port: dbPort, user: "postgres", password: adminPassword,
    persistent: true, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => {} });
  await database.initialise();
  await database.start();
  await database.createDatabase(fixtureDatabase);
  admin = new Pool({ connectionString: url("postgres", adminPassword) });
  await admin.query(`CREATE ROLE jobguard_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; CREATE ROLE jobguard_session_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; CREATE ROLE jobguard_money_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  await installAuditCommandWriterRoles(admin);
  const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
  const { migrate } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
  await migrate(admin);
  await admin.query(`ALTER ROLE jobguard_runtime LOGIN PASSWORD '${runtimePassword}'; ALTER ROLE jobguard_identity LOGIN PASSWORD '${identityPassword}'`);

  const bindings = {
    PILOT_RUNTIME_DATABASE_URL: url("jobguard_runtime", runtimePassword),
    IDENTITY_DATABASE_URL: url("jobguard_identity", identityPassword),
    AUTH_CODE_SECRET: randomBytes(32).toString("hex"),
    AUTH_ALLOWED_ORIGIN: origin,
    PILOT_API_ORIGIN: "https://pilot-api-browser.invalid",
    S3_ENDPOINT: "https://fixture-storage.invalid",
    S3_REGION: "fictional",
    S3_BUCKET: "jobguard-pilot-browser",
    S3_ACCESS_KEY_ID: "fictional-browser-key",
    S3_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
  };
  const approval = pilotApprovalFixture();
  Object.assign(process.env, approval.env, bindings, {
    JOBGUARD_PILOT_21_APPROVAL: JSON.stringify({ ...approval.approval, expiresAt: new Date(Date.now() + 600_000).toISOString() }),
    JOBGUARD_PILOT_RESOURCES: JSON.stringify({ version: "pilot-resources.v1", sha256: Object.fromEntries(
      Object.entries(bindings).map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")]),
    ) }),
  });
  const user = randomUUID(), account = randomUUID(), member = randomUUID();
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES('builder@browser-fixture.invalid',$1)", [user]);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1),($2)", [tenant, other]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional Browser Builder')", [account, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, tenant, member]);
  const digest = createHmac("sha256", bindings.AUTH_CODE_SECRET).update(`session:${sessionToken}`).digest("hex");
  await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'pilot_no_charge',$3,$4,now()+interval '1 hour')",
    [randomUUID(), user, digest, randomBytes(32).toString("base64url")]);
  for (const [owner, title] of [[tenant, "Visible pilot fixture"], [other, "Other tenant fixture"]]) {
    const id = randomUUID();
    await admin.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,$3)", [owner, id, title]);
    await admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','pilot_no_charge','quote_activation')", [owner, id]);
  }
  const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${hostname}`, "-keyout", key, "-out", cert], { stdio: "ignore" });
  server = fork(join(__dirname, "pilot-04a-server.mjs"), [hostname, String(port), key, cert], { execArgv: [] });
  await Promise.race([
    once(server, "message"),
    once(server, "exit").then(([code]) => { throw new Error(`Pilot fixture server exited with status ${code}`); }),
  ]);
});

test.afterAll(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  if (database && admin) await closeTestDatabase(database, join(directory, "db"), admin);
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
  test(`verified builder can capture and stage an exact quote at ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await context.addCookies([{ name: "__Host-jobguard_pilot_session", value: sessionToken, url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
    const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/session");
    await page.goto(`${origin}/jobs`);
    const sessionView = await sessionResponse;
    expect(sessionView.ok(), sessionView.ok() ? "" : await sessionView.text()).toBe(true);
    await expect(page.getByText("Visible pilot fixture")).toBeVisible();
    await expect(page.getByText("Other tenant fixture")).toHaveCount(0);
    await page.getByRole("link", { name: "New job" }).click();
    const title = `Fictional shed ${viewport.width}`;
    const notes = `JOB: ${title}\nITEM: Paint shed | QTY: 1 | UNIT: item | RATE: £100.00`;
    if (viewport.width === 360) {
      await page.addInitScript(text => {
        window.__JOBGUARD_SPEECH_ADAPTER__ = {
          configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
          available: async () => "installed",
          install: async () => true,
          start(callbacks) {
            queueMicrotask(() => { callbacks.final(text, "fixture-final"); callbacks.end(); });
            return { stop() {}, cancel() {} };
          },
        };
      }, notes);
      await page.reload();
      await page.getByRole("button", { name: "Talk through the example", exact: true }).click();
      await page.getByRole("button", { name: "Use these words" }).click();
    } else {
      await page.getByLabel("Work details").fill(notes);
    }
    await page.getByRole("button", { name: "Make my draft" }).click();
    await page.getByRole("button", { name: "Check and edit my draft" }).click();
    await page.getByRole("button", { name: "Save customer and site" }).click();
    await expect(page.getByTestId("job-party-details")).toBeVisible();
    await expect(page.getByText(viewport.width === 360 ? "On-device dictation · checked by you" : "Typed notes · checked by you")).toBeVisible();
    await page.getByRole("button", { name: "Accept Paint shed", exact: true }).click();
    await page.getByLabel("Answer Confirm disposal and waste allowance").fill("Included in the fictional scope");
    await page.getByRole("button", { name: /confirm scope/i }).click();
    await page.getByRole("button", { name: "Price the work" }).click();
    await page.getByText("Business details for the quote").click();
    await page.getByLabel("Trading name").fill("Fictional Browser Builder");
    await page.getByLabel(/Business address/).fill("1 Fixture Lane");
    await page.getByLabel("Business email").fill("builder@browser-fixture.invalid");
    await page.getByRole("button", { name: "Save business details" }).click();
    await expect(page.getByText("Business details saved.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Save draft revision" }).click();
    await expect(page.getByTestId("quote-revision")).toHaveText("1");
    await page.getByRole("button", { name: "Preview this quote" }).click();
    const hash = page.getByTestId("quote-artifact-hash");
    await expect(hash).toHaveText(/^[a-f0-9]{64}$/);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download quote PDF" }).click();
    const path = await (await download).path();
    expect(createHash("sha256").update(await readFile(path!)).digest("hex")).toBe(await hash.textContent());
    await page.getByRole("button", { name: "Approve and stage this quote and invitation" }).click();
    await expect(page.getByText("Quote and customer invitation queued. Nothing sent yet.")).toBeVisible();
    await page.getByRole("button", { name: "Record fixture acceptance" }).click();
    await expect(page.getByText(/Acceptance recorded from a customer fixture/)).toBeVisible();
    const savedJob = page.url();
    await page.getByRole("button", { name: "Switch this job live" }).click();
    await expect(page.getByText("Job live on the accepted quote. No JobGuard charge.")).toBeVisible();
    expect(page.url()).toBe(savedJob);
    await page.getByRole("button", { name: "Start work", exact: true }).click();
    await expect(page.getByText("In progress", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark complete" })).toBeDisabled();
    await page.getByLabel("Extra work").fill("Paint the fictional shelf");
    await page.getByRole("button", { name: "Log extra" }).click();
    await expect(page.getByText("Paint the fictional shelf · draft")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Paint the fictional shelf · draft")).toBeVisible();
    await page.goto(`${origin}/jobs`);
    await expect(page.getByText(title)).toBeVisible();
  });
}
