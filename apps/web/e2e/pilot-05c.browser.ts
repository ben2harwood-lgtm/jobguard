import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
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
const fixtureDatabase = "jobguard_pilot_draft_browser";
const tenant = randomUUID(), other = randomUUID(), sessionToken = randomBytes(32).toString("base64url");
let origin: string, directory: string, database: EmbeddedPostgres, admin: Pool;
let server: ChildProcess | undefined;
let storage: ReturnType<typeof createServer>;
let storedPhoto: { key: string; bytes: Buffer } | undefined;
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

  storage = createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    if (!request.headers.authorization) {
      response.writeHead(403).end();
    } else if (url.searchParams.has("versioning")) {
      response.writeHead(200, { "content-type": "application/xml" })
        .end("<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>");
    } else if (storedPhoto && url.pathname === `/jobguard-pilot-browser/${storedPhoto.key}` &&
      url.searchParams.get("versionId") === "fictional-v1") {
      response.writeHead(200, { "x-amz-version-id": "fictional-v1", "content-type": "image/png",
        "content-length": storedPhoto.bytes.length }).end(request.method === "HEAD" ? undefined : storedPhoto.bytes);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>(resolve => storage.listen(0, "127.0.0.1", resolve));
  const address = storage.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture storage port");
  const bindings = {
    PILOT_RUNTIME_DATABASE_URL: url("jobguard_runtime", runtimePassword),
    IDENTITY_DATABASE_URL: url("jobguard_identity", identityPassword),
    AUTH_CODE_SECRET: randomBytes(32).toString("hex"),
    AUTH_ALLOWED_ORIGIN: origin,
    PILOT_API_ORIGIN: "https://pilot-api-browser.invalid",
    S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
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
  if (storage) await new Promise<void>(resolve => storage.close(() => resolve()));
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

async function post<T = unknown>(page: Page, path: string, body: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ path, body, headers }) => {
    const response = await fetch(path, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as T };
  }, { path, body, headers });
}

test("PILOT-05c: builder draft at phone and desktop width, with fresh exports and stale checklist refusal", async ({ page, context }) => {
  await page.setViewportSize({ width: 1080, height: 900 });
  await context.addCookies([{ name: "__Host-jobguard_pilot_session", value: sessionToken, url: origin,
    httpOnly: true, secure: true, sameSite: "Lax" }]);
  await stagePilotQuote(page, 1080);
  await page.getByRole("button", { name: "Record fixture acceptance" }).click();
  await expect(page.getByText(/Acceptance recorded from a customer fixture/)).toBeVisible();
  await page.getByRole("button", { name: "Switch this job live" }).click();
  await expect(page.getByText("Job live on the accepted quote. No JobGuard charge.")).toBeVisible();
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByRole("button", { name: "Start work", exact: true }).click();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  const finalCheck = `/api/jobs/${jobId}/final-check`;
  const { csrfToken } = await page.evaluate(async () =>
    (await fetch("/api/auth/session")).json() as Promise<{ csrfToken: string }>);
  const headers = { "x-csrf-token": csrfToken, "x-tenant-id": tenant };
  const readCheck = () => page.evaluate(async ({ finalCheck, headers }) => {
    const response = await fetch(finalCheck, { headers, cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, { finalCheck, headers });

  await expect(page.getByText("Final Check terms are not yet approved.")).toBeVisible();
  await expect(page.getByTestId("final-check-reveal")).toHaveCount(0);
  const unlocked = await readCheck();
  expect(unlocked).toEqual({ status: 200, body: { state: "unlocked", items: [], message: null } });

  const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  const dbModule = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href) as typeof import("@jobguard/db");
  const workerModule = await nativeImport(pathToFileURL(join(process.cwd(), "../api/dist/pilot-worker.js")).href) as typeof import("../../api/src/pilot-worker.js");
  const { generatePracticePng } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/practice-proof-image.js")).href) as
    typeof import("../../../packages/db/src/practice-proof-image.js");
  const { pilotFixtureFinalCheckPorts } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/shadow-detection-repository.js")).href) as
    typeof import("../../../packages/db/src/shadow-detection-repository.js");
  const photo = generatePracticePng();
  const photoHash = createHash("sha256").update(photo).digest("hex");
  const scope = (await admin.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed'",
    [tenant, jobId])).rows[0].id as string;
  const proofPath = `/api/jobs/${jobId}/proof`;
  const upload = await post<{ uploadId: string; uploadUrl: string }>(page, proofPath, {
    version: "pilot-proof.v1", action: "begin", commandId: randomUUID(), scopeItemId: scope,
    expectedSha256: photoHash, byteLength: photo.length, contentType: "image/png",
  }, headers);
  expect(upload.status, JSON.stringify(upload.body)).toBe(200);
  const key = new URL(upload.body.uploadUrl).pathname.replace(/^\/jobguard-pilot-browser\//u, "");
  storedPhoto = { key, bytes: photo };
  const proof = await post<{ evidenceId: string }>(page, proofPath, {
    version: "pilot-proof.v1", action: "finalize", commandId: randomUUID(), uploadId: upload.body.uploadId,
    objectVersionId: "fictional-v1",
  }, headers);
  expect(proof.status, JSON.stringify(proof.body)).toBe(200);
  const evidence = proof.body.evidenceId;
  const receipt = (await admin.query("SELECT server_received_at::text AS received FROM app.evidence_object WHERE tenant_id=$1 AND id=$2",
    [tenant, evidence])).rows[0];
  const descriptions = ["Fitted shelving units", "Installed kitchen tiles"] as const;
  for (const description of descriptions) {
    const signal = randomUUID();
    await admin.query(`INSERT INTO app.shadow_commercial_signal(
      tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
      VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic.v1',clock_timestamp(),$5,'low','held_for_final_check')`,
    [tenant, jobId, signal, randomUUID(), description]);
    await admin.query(`INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at)
      VALUES($1,$2,$3,$4,'fictional-v1',$5,$6)`, [tenant, jobId, signal, evidence, photoHash, receipt.received]);
    await expect(page.getByText(description, { exact: true })).toHaveCount(0);
  }
  expect(await readCheck()).toEqual(unlocked);
  await expect(page.getByTestId("final-check-reveal")).toHaveCount(0);

  const terms = "pilot_final_check_terms.v1";
  await admin.query("INSERT INTO app.pilot_final_check_terms_approval(tenant_id,version,approval_sha256) VALUES($1,$2,$3)",
    [tenant, terms, createHash("sha256").update(terms).digest("hex")]);
  await page.reload();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText("Complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prepare final account" }).click();
  await page.getByRole("combobox", { name: /Paint shed/ }).selectOption("done");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Complete final account" }).click();
  await expect(page.getByText("Final account locked.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("final-check-status")).toContainText("Running JobGuard's final check");

  const runtimeUrl = new URL(process.env.PILOT_RUNTIME_DATABASE_URL!);
  const shadowPassword = randomUUID();
  await admin.query(`CREATE ROLE jobguard_pilot_shadow_login LOGIN PASSWORD '${shadowPassword}';
    GRANT jobguard_shadow,jobguard_pilot_final_check TO jobguard_pilot_shadow_login`);
  runtimeUrl.username = "jobguard_pilot_shadow_login";
  runtimeUrl.password = shadowPassword;
  const shadow = new Pool({ connectionString: runtimeUrl.toString() });
  try {
    const { rows } = await shadow.query("SELECT * FROM app.pilot_final_check_requests()");
    const reservation = rows.find(row => row.job_id === jobId);
    expect(reservation).toBeDefined();
    const task = { version: "final-check-task.v1" as const, jobId, tenantId: tenant,
      lockId: reservation.lock_id, manifestId: reservation.manifest_id, executionId: randomUUID() };
    await shadow.query("SELECT app.pilot_final_check_ack($1,$2,$3,$4)", [tenant, jobId, task.lockId, task.manifestId]);
    const { requirePilotG1 } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/config/dist/index.js")).href) as typeof import("../../../packages/config/src/index.js");
    const executor = workerModule.pilotFinalCheckExecutor(shadow, () => requirePilotG1(process.env), pool => {
      const certificates = new dbModule.FinalCheckCompletionRepository(pool);
      return { worker: pilotFixtureFinalCheckPorts(pool, photoHash), publish: certificates.publish.bind(certificates) };
    });
    const actor = (await admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2",
      [tenant, identityFixture.member])).rows[0];
    // The fixture leaves request credentials off the worker context. The dedicated
    // shadow login still has to bind the exact persisted reservation in PostgreSQL.
    const workerContext = dbModule.verifiedTenantContextFromMembership({
      tenantId: tenant, membershipId: identityFixture.member, identityUserId: actor.identity_user_id,
    } as Parameters<typeof dbModule.verifiedTenantContextFromMembership>[0]);
    await workerModule.pilotWorkerTasks(payload => executor(workerContext, payload)).final_check!(task, {} as never);
    expect((await admin.query("SELECT check_id FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2",
      [tenant, jobId])).rows).toEqual([{ check_id: task.manifestId }]);
  } finally { await shadow.end(); }

  const findings = page.getByTestId("final-check-reveal");
  const disputed = findings.locator("article").filter({ hasText: descriptions[0] });
  await disputed.getByRole("button", { name: "Dispute without a reference" }).click();
  await expect(findings.getByTestId("final-check-disputes")).toContainText("1 answer is disputed");
  const confirmed = findings.locator("article").filter({ hasText: descriptions[1] });
  await confirmed.getByRole("button", { name: "Yes — this was extra work" }).click();
  await expect(confirmed.getByTestId("final-check-disposition")).toContainText("added to your extras as a draft");
  await expect(page.getByText("Installed kitchen tiles · draft", { exact: true })).toBeVisible();

  await expect(page.getByText("Invoices are not yet available in the pilot until the invoice rules are approved.")).toBeVisible();
  expect(await post(page, `/api/jobs/${jobId}/customer-invoices`, {}, headers))
    .toEqual({ status: 409, body: { code: "PILOT_INVOICE_POLICY_PENDING" } });
  for (const endpoint of ["receipts", "credit-notes"]) {
    const refused = await post(page, `/api/jobs/${jobId}/customer-invoices/${randomUUID()}/${endpoint}`, {}, headers);
    expect(refused).toEqual({ status: 401, body: { code: "UNAUTHENTICATED" } });
  }
  expect((await admin.query("SELECT 1 FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [tenant, jobId])).rowCount).toBe(0);

  await page.reload();
  const draftPanel = page.getByRole("heading", { name: "Prepare an invoice draft", exact: true }).locator("ancestor::section[1]");
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const checkbox of await draftPanel.getByRole("checkbox").all()) await checkbox.check();
    await draftPanel.getByLabel("Builder-stated VAT number").fill("unknown");
    await draftPanel.getByRole("button", { name: "Preview draft", exact: true }).click();
    await expect(draftPanel.getByRole("alert")).toContainText("Draft unavailable");
    await draftPanel.getByLabel("Builder-stated VAT number").fill("GB123456789");
    await draftPanel.getByRole("button", { name: "Preview draft", exact: true }).click();
    await expect(draftPanel.getByRole("heading", { name: "Draft — This is not a VAT invoice", exact: true })).toBeVisible();
    for (const [button, extension] of [["Download draft CSV", "csv"], ["Download printable draft", "html"]] as const) {
      const waiting = page.waitForEvent("download");
      await draftPanel.getByRole("button", { name: button }).click();
      const download = await waiting;
      expect(download.suggestedFilename()).toBe(`invoice-draft.${extension}`);
      const contents = await readFile((await download.path())!, "utf8");
      for (const text of ["Draft — This is not a VAT invoice", "100.00", "20.00", "120.00", "Missing"])
        expect(contents).toContain(text);
      for (const text of ["Installed kitchen tiles", "Fitted shelving units"])
        expect(contents).not.toContain(text); // Unconfirmed findings/draft extras are absent.
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect((await post(page, "/api/firm-profile", { version: "firm-profile.v1", tradingName: "Changed fixture builder",
    addressLines: ["2 Fixture Lane"], contactEmail: "builder@browser-fixture.invalid", contactPhone: "" }, headers)).status).toBe(200);
  await draftPanel.getByRole("button", { name: "Download draft CSV" }).click();
  await expect(draftPanel.getByRole("alert")).toContainText("changed");
  for (const checkbox of await draftPanel.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
});
