import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
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
let identityFixture: { member: string; digest: string; secret: string };

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
  identityFixture = { member, digest, secret: bindings.AUTH_CODE_SECRET };
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

async function stagePilotQuote(page: Page, width: number) {
  const sessionResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/session");
  await page.goto(`${origin}/jobs`);
  const sessionView = await sessionResponse;
  expect(sessionView.ok(), sessionView.ok() ? "" : await sessionView.text()).toBe(true);
  await expect(page.getByText("Visible pilot fixture")).toBeVisible();
  await expect(page.getByText("Other tenant fixture")).toHaveCount(0);
  await page.getByRole("link", { name: "New job" }).click();
  const title = `Fictional shed ${width}`;
  const notes = `JOB: ${title}\nITEM: Paint shed | QTY: 1 | UNIT: item | RATE: £100.00`;
  if (width === 360) {
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
  await expect(page.getByText(width === 360 ? "On-device dictation · checked by you" : "Typed notes · checked by you")).toBeVisible();
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
}

for (const viewport of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
  test(`verified builder can capture and stage an exact quote at ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await context.addCookies([{ name: "__Host-jobguard_pilot_session", value: sessionToken, url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
    await stagePilotQuote(page, viewport.width);
    const title = `Fictional shed ${viewport.width}`;
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

test("pilot customer reviews an exact quote and acts on their live job at 360px", async ({ page, context, browser }) => {
  await context.addCookies([{ name: "__Host-jobguard_pilot_session", value: sessionToken, url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
  await page.setViewportSize({ width: 360, height: 800 });
  await stagePilotQuote(page, 360);

  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  const { customer_id: customerId } = (await admin.query(
    `SELECT b.customer_id FROM app.job_party_current p JOIN app.job_party_binding b
      ON (p.tenant_id,p.job_id,p.binding_id)=(b.tenant_id,b.job_id,b.id) WHERE p.tenant_id=$1 AND p.job_id=$2`,
    [tenant, jobId],
  )).rows[0];
  const session = await page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    return { status: response.status, body: await response.json() as { csrfToken: string } };
  });
  expect(session.status).toBe(200);
  const { csrfToken } = session.body;
  const issued = await post<{ grantId: string }>(page, "/api/customer-portal/issue",
    { version: "customer-link-issue.v1", tenantId: tenant, jobId, customerId }, { "x-csrf-token": csrfToken });
  expect(issued.status, JSON.stringify(issued.body)).toBe(200);
  const { grantId } = issued.body;
  const { adapter, recipient, immutable_content: reference } = (await admin.query(`
    SELECT o.adapter,o.recipient,o.immutable_content FROM app.customer_portal_grant g
    JOIN app.action_outbox o ON (g.tenant_id,g.outbox_id)=(o.tenant_id,o.id)
    WHERE g.tenant_id=$1 AND g.id=$2`, [tenant, grantId])).rows[0];
  expect(adapter).toBe("fake_email");
  expect(recipient).toMatch(/@[^@]+\.invalid$/u);
  const loadDb = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
  const db = await loadDb(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
  // An isolated mailbox consumes the persisted invitation reference for just its intended recipient.
  const hmac = (value: string) => createHmac("sha256", identityFixture.secret).update(value).digest("hex");
  const inbox = new Map([[recipient, db.customerSigninLink(reference, hmac)]]);
  expect(inbox.get("uninvited@fixture.invalid")).toBeUndefined();

  const customer = await browser.newContext({ viewport: { width: 360, height: 800 }, ignoreHTTPSErrors: true });
  try {
    const portal = await customer.newPage();
    await portal.goto(`${origin}${inbox.get(recipient)}`);
    await portal.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(portal.getByText("You are signed in to this job.")).toBeVisible();
    expect(portal.url()).not.toContain("#");
    const view = await customer.newPage();
    const quote = await portal.getByRole("link", { name: "Review your quote" }).getAttribute("href");
    await view.goto(`${origin}${quote}`);
    await expect(view.getByRole("heading", { name: "Domestic cancellation-notice kit" })).toBeVisible();
    await view.getByRole("button", { name: "Accept this quote" }).click();
    await expect(view.getByText("You accepted this quote.")).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Accepted by the authenticated customer/)).toBeVisible();
    await page.getByRole("button", { name: "Switch this job live" }).click();
    await expect(page.getByText("Job live on the accepted quote. No JobGuard charge.")).toBeVisible();

    const { member, digest } = identityFixture;
    const actor = (await admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [tenant, member])).rows[0];
    const builderContext = db.verifiedTenantContextFromMembership(
      { tenantId: tenant, identityUserId: actor.identity_user_id, membershipId: member } as Parameters<typeof db.verifiedTenantContextFromMembership>[0],
      { kind: "real", credential: digest },
    );
    const extra = randomUUID();
    const description = "Paint the fictional shelf";
    await new db.VariationRepository(admin).logBuilderExtra(builderContext, {
      version: "log-builder-extra.v1", actorMembershipId: member, deviceId: null, deviceCapturedAt: null,
      proposal: { version: "variation-proposal.v1", id: extra, jobId, scopeItemId: extra, existingScopeItemId: null,
        lineageParentScopeItemId: null, captureKind: "text", captureText: description, description, suggestion: null },
      price: { quantity: "1", unit: "item", unitRatePence: 5000, direction: "addition", confirmedByMembershipId: member,
        rateProvenance: { kind: "human_entered", sourceRef: "synthetic://fixture", sourceHash: "a".repeat(64), rateVersion: "fixture-v1" } },
    }, true);
    await view.goto(`${origin}/customer/extras?jobId=${jobId}`);
    await view.getByRole("button", { name: "Approve revision 1 for £50.00 net" }).click();
    await expect(view.getByText("Approved · authenticated customer")).toBeVisible();

    await seedStage(db, builderContext, jobId);
    await view.goto(`${origin}/customer/jobs/${jobId}`);
    await view.getByRole("button", { name: "Acknowledge this recorded completion" }).click();
    await expect(view.getByText("Historical acknowledgement recorded.")).toBeVisible();

    const read = (requestedJob: string) => post(view, "/api/customer-portal/read",
      { version: "customer-read.v1", jobId: requestedJob });
    const own = await read(jobId);
    expect(own.status).toBe(200);
    const cookie = (await customer.cookies()).find(item => item.name === "__Host-jobguard_pilot_customer");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", expires: -1 });
    await checkDirectNestRead(jobId, `${cookie!.name}=${cookie!.value}`, own.body);
    const foreign = await read(randomUUID());
    expect(foreign.status).toBe(401);
    expect(foreign.body).toEqual({ code: "CUSTOMER_REFUSED" });

    await portal.getByLabel("Message", { exact: true }).fill("There are exposed live wires beside the new socket.");
    await portal.getByRole("button", { name: "Save message" }).click();
    await expect(portal.getByText("Message saved for your builder with its evidence.")).toBeVisible();
    await view.goto(`${origin}${inbox.get(recipient)}`);
    await view.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(view.getByText(/This link is unavailable/)).toBeVisible();
    await portal.getByRole("button", { name: "Sign out" }).click();
    await expect(portal.getByText("You are signed out.")).toBeVisible();
    expect((await read(jobId)).status).toBe(401);
  } finally {
    await customer.close();
  }
});

async function post<T = unknown>(page: Page, path: string, body: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ path, body, headers }) => {
    const response = await fetch(path, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as T };
  }, { path, body, headers });
}

async function seedStage(db: typeof import("@jobguard/db"), builder: import("@jobguard/db").VerifiedTenantContext, jobId: string) {
  await db.withTenant(admin, builder, async ({ $client }) => {
    const { scope_item_id: scope } = (await $client.query("SELECT scope_item_id FROM app.scope_revision WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision LIMIT 1", [tenant, jobId])).rows[0];
    const evidence = randomUUID(), link = randomUUID(), version = randomUUID(), hash = "a".repeat(64);
    await $client.query(`INSERT INTO app.evidence_upload(tenant_id,id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,
      maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
      VALUES($1,$2::uuid,$3,$4,$2::text,$5,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$6,clock_timestamp(),clock_timestamp())`,
      [tenant, evidence, jobId, scope, hash, version]);
    await $client.query(`INSERT INTO app.evidence_object(tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,
      sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
      VALUES($1,$2::uuid,$2::uuid,$3,$4,'original','completion_photo',$2::text,$5,$6,80,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())`,
      [tenant, evidence, jobId, scope, version, hash]);
    await $client.query("INSERT INTO app.evidence_link(tenant_id,id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'completion_photo')",
      [tenant, link, evidence, jobId, scope]);
    await $client.query("INSERT INTO app.stage_completion(tenant_id,id,job_id,scope_item_id,stage,evidence_link_id,command_id) VALUES($1,$2,$3,$4,'completion-photo-stage',$5,$6)",
      [tenant, randomUUID(), jobId, scope, link, randomUUID()]);
  });
}

async function checkDirectNestRead(jobId: string, cookie: string, expected: unknown) {
  const port = await freePort(57600, 100);
  const api = fork(join(process.cwd(), "../api/dist/main.js"), [], {
    env: { ...process.env, API_PORT: String(port) }, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const send = (path: string, body?: unknown) => new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = httpRequest({
      hostname: "127.0.0.1", port, path, method: body === undefined ? "GET" : "POST",
      headers: { host: "pilot-api-browser.invalid", origin, cookie: body === undefined ? "" : cookie, "content-type": "application/json" },
    }, response => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        try { resolve({ status: response.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("Pilot fixture API timed out")));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  try {
    await expect.poll(async () => (await send("/healthz").catch(() => undefined))?.status, { timeout: 10_000 }).toBe(200);
    expect(await send("/customer-portal/read", { version: "customer-read.v1", jobId })).toEqual({ status: 200, body: expected });
    expect(await send("/customer-portal/read", { version: "customer-read.v1", jobId: randomUUID() })).toEqual({ status: 401, body: { code: "CUSTOMER_REFUSED" } });
  } finally {
    if (api.exitCode === null && api.signalCode === null) {
      const exited = once(api, "exit");
      api.kill();
      await exited;
    }
  }
}
