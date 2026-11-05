import { expect, test } from "@playwright/test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
// Like CH-9-mapped: native import keeps built core/db ESM out of Playwright's loader.
const loadDb = () => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>)(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
// Runs headless in the configured mobile-360 and desktop projects. Fictional records only.
test.setTimeout(120_000);
test("stored practice notices survive reload, bind approval, keep service facts distinct and retry one command", async ({ page, context, baseURL }) => {
  const db = await loadDb(), tenantId = randomUUID(), userId = randomUUID(), membershipId = randomUUID(), accountId = randomUUID();
  const token = randomBytes(32).toString("base64url"), csrf = randomBytes(24).toString("base64url");
  const pool = new Pool({ connectionString: process.env.E2E_ADMIN_DATABASE_URL ?? "postgresql://postgres:sbox-e2e-owner@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  let jobId: string;
  try {
    const verified = db.verifiedTenantContextFromMembership({ identityUserId: userId, tenantId, membershipId } as never);
    await pool.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
    await pool.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
    await pool.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${randomUUID()}@fictional.invalid`, userId]);
    await db.withTenant(pool, verified, async tx => {
      await tx.$client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional notice practice')", [accountId, tenantId]);
      await tx.$client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [membershipId, tenantId, accountId, userId]);
    });
    await pool.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [userId, tenantId, membershipId]);
    const digest = createHmac("sha256", process.env.AUTH_CODE_SECRET ?? "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
    await pool.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')", [randomUUID(), userId, digest, csrf]);
    // Seed the job through the repository, never an HTTP route.
    jobId = (await new db.JobRepository(pool).create(verified, ["job:update"], { title: "Fictional notice practice job" })).id;
  } finally { await pool.end(); }
  await context.addCookies([{ name: "jobguard_session", value: token, url: baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const main = page.getByRole("main"), route = `/api/jobs/${jobId}/notice-fixtures`;
  await page.goto(`/jobs/${jobId}/notice-fixtures`);
  await expect(main.getByText(/reviewed by nobody/)).toBeVisible();
  await expect(main.getByRole("button", { name: "Store revision and preview" })).toBeEnabled();
  const fill = async (due = "2026-11-10") => {
    await main.getByLabel("Recipient reference").fill("fictional-recipient-A");
    await main.getByLabel("Due date", { exact: true }).fill(due);
    await main.getByLabel("Fictional contract reference", { exact: true }).fill("fictional-contract-A");
    await main.getByLabel("Trigger evidence UUID").fill(randomUUID());
  };
  await fill();
  await main.getByLabel("Fictional profile ID").fill("unsupported-profile");
  await main.getByRole("button", { name: "Store revision and preview" }).click();
  await expect(main.getByRole("alert")).toContainText("Flagged for professional advice");
  await expect(main.getByTestId("notice-preview")).toHaveCount(0);
  await main.getByLabel("Fictional profile ID").fill("fixture-calendar");
  await main.getByLabel("Due date", { exact: true }).fill("");
  await main.getByRole("button", { name: "Store revision and preview" }).click();
  await expect(main.getByRole("alert")).toContainText("complete the due date");
  await main.getByLabel("Due date", { exact: true }).fill("2026-11-10");
  // Lose a reply after the server stored the revision; reload must keep its command ID.
  await page.route(`**${route}`, async intercepted => {
    if (intercepted.request().method() !== "POST") return intercepted.continue();
    await intercepted.fetch(); await intercepted.abort("failed");
  });
  await main.getByRole("button", { name: "Store revision and preview" }).click();
  await expect(main.getByRole("button", { name: "Retry same saved command" })).toBeEnabled();
  await page.unroute(`**${route}`);
  await page.reload();
  await main.getByRole("button", { name: "Retry same saved command" }).click();
  await expect(main.getByRole("heading", { name: "Record 1: revision", exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Record 2: revision", exact: true })).toHaveCount(0);
  const preview = main.getByTestId("notice-preview");
  await expect(preview).toContainText('"revision": 1'); await expect(preview).toContainText("fictional-recipient-A");
  await expect(preview).toContainText("fixture_email");
  const exact = await preview.textContent();
  await page.reload(); await expect(preview).toHaveText(exact!);
  await main.getByRole("button", { name: "Approve this exact practice preview", exact: true }).click();
  await expect(main.getByText("Approval binds this exact practice preview. Nothing was sent.")).toBeVisible();
  const service = main.getByRole("form", { name: "Record service fact" });
  const fact = async (state: string) => {
    await service.getByLabel("Separate service fact").selectOption(state);
    await service.getByRole("button", { name: "Record practice service fact" }).click();
  };
  await fact("queued");
  await service.getByLabel("Fictional provider reference").fill("fictional-provider");
  await service.getByLabel("Service evidence UUID").fill(randomUUID());
  for (const state of ["provider_accepted", "outcome_unknown", "read"]) {
    await fact(state); await expect(main.getByRole("button", { name: "Record practice service fact" })).toBeEnabled();
  }
  await fact("legally_served");
  await expect(main.getByRole("alert")).toContainText("separate assessment reference");
  await main.getByRole("button", { name: "Refresh stored history" }).click();
  await expect(main.getByRole("button", { name: "Record practice service fact" })).toBeEnabled();
  await service.getByLabel("Separate legal assessment reference").fill("fictional-assessor");
  await service.getByLabel("Service evidence UUID").fill(randomUUID());
  await fact("legally_served");
  await expect(main.getByRole("heading", { name: "Record 7: service_event", exact: true })).toBeVisible();
  const session = await (await page.request.get("/api/auth/session")).json();
  const headers = { "x-tenant-id": tenantId, "x-csrf-token": session.csrfToken, origin: baseURL! };
  const prior = await (await page.request.get(route, { headers })).json();
  expect(prior.decisions[0].approvedPreview).toBe(JSON.stringify(prior.preview));
  expect(prior.serviceBook.events.map((e: { state: string }) => e.state)).toEqual(["queued", "provider_accepted", "outcome_unknown", "read", "legally_served"]);
  await fill("2026-11-12");
  await main.getByRole("button", { name: "Store revision and preview" }).click();
  await expect(preview).toContainText('"revision": 2');
  await expect(main.getByText(/Old, expired or changed previews cannot be used/)).toBeVisible();
  expect((await page.request.post(route, { headers, data: { version: "notice.fixture-record-command.v1", commandId: randomUUID(), jobId, noticeId: jobId,
    kind: "service_event", data: { id: randomUUID(), noticeRevisionId: prior.preview.input.revisionId, decisionId: prior.decisions[0].id,
      state: "read", evidenceId: randomUUID(), providerReference: "fictional", legalAssessmentReference: null } } })).status()).toBe(409);
  await expect(main.getByRole("button", { name: "Record practice service fact" })).toBeDisabled();
  await main.getByRole("button", { name: "Reject this exact practice preview" }).click();
  await expect(main.getByRole("heading", { name: "Record 9: decision", exact: true })).toBeVisible();
  for (const name of ["Generate notice", "Send notice"]) await expect(main.getByRole("button", { name, exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const target of await main.locator("button, input, select, a").all()) {
    const box = await target.boundingBox(); if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
