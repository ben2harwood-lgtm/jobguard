import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { E2E_AUTH_CODE_SECRET, E2E_RUNTIME_URL, E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { signInForChooser } from "./helpers/chooser-sign-in";
// Native ESM import, as CH-9-mapped: Playwright must not transform core/db graphs.
const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
const loadDb = () => nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href) as Promise<typeof import("@jobguard/db")>;
const loadIdentity = () => nativeImport(pathToFileURL(join(process.cwd(), "../api/dist/auth/index.js")).href) as Promise<typeof import("@jobguard/api/identity")>;
test.use({ headless: true });
test("stored VAT documents: explicit facts, refusal, uncertain replay and reload without issuing", async ({ page, context, baseURL }) => {
  await signInForChooser(page);
  const session = await page.evaluate(async () => (await fetch("/api/auth/session", { cache: "no-store" })).json());
  const token = (await context.cookies()).find(cookie => cookie.name === "jobguard_session")!.value;
  const { JobRepository, VatFixtureRepository } = await loadDb();
  const { createIdentityApplication, resolveVerifiedTenantContext } = await loadIdentity();
  const identity = createIdentityApplication({ ...process.env, JOBGUARD_ENV: "synthetic_demo", AUTH_CODE_SECRET: E2E_AUTH_CODE_SECRET,
    AUTH_ALLOWED_ORIGIN: baseURL!, IDENTITY_DATABASE_URL: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo" });
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 }), admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  try {
    const verified = await resolveVerifiedTenantContext(identity.provider, { sessionToken: token, tenantHeader: session.memberships[0].tenantId, csrfToken: session.csrfToken, origin: baseURL! }, baseURL!);
    // The job is seeded through the repository, never through an HTTP fixture route.
    const job = await new JobRepository(runtime).create(verified, ["job:update"], { title: "Fictional M4-21 browser job" });
    const path = `/api/jobs/${job.id}/vat-fixtures`;
    await page.goto(`/jobs/${job.id}/vat-fixtures`);
    await expect(page.getByRole("heading", { name: "Add one synthetic document" })).toBeVisible();
    await page.getByLabel("Fictional supplier reference").fill("Fictional builder");
    await page.getByLabel("Fictional customer reference").fill("Fictional customer");
    await page.getByLabel("Candidate tax basis").selectOption("net_after_retention");
    await page.getByLabel("Document kind").selectOption("interim");
    await page.getByLabel("Document reference", { exact: true }).fill("VAT-PRACTICE-1");
    await page.getByLabel("Document date", { exact: true }).fill("2026-11-04");
    await page.getByLabel("Interim certification UUID (fixture lineage)", { exact: true }).fill(randomUUID());
    await page.getByLabel("Retention profile UUID (fixture lineage)", { exact: true }).fill(randomUUID());
    const treatment = page.getByLabel("Treatment");
    await expect(treatment).toHaveValue(""); // No default or fallback rate.
    await treatment.selectOption("drc_20");
    await page.getByLabel("Cumulative net (integer pence)").fill("10000");
    await page.getByLabel("Retained principal (integer pence)").fill("1000");
    for (const [label, value] of [["Supplier VAT registered", "true"], ["Customer VAT registered", "true"], ["Customer end user", "true"], ["Intermediary supplier", "false"], ["Construction reverse charge in scope", "true"]]) await page.getByLabel(label!).selectOption(value!);
    await page.getByLabel("Supplier VAT number (blank only if unregistered)").fill("fictional-vat");
    await page.getByLabel("Customer VAT number (blank only if unregistered)").fill("fictional-client-vat");
    await page.getByLabel("Fictional eligibility actor UUID (not authorization)").fill(randomUUID());
    await page.getByLabel("Fictional eligibility evidence UUID").fill(randomUUID());
    await page.getByLabel("Qualifying basis reference (fictional assertion)").fill("Fictional test qualification");
    await page.getByRole("button", { name: "Store practice document", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("reverse charge eligibility inputs conflict");
    expect((await admin.query("SELECT count(*)::int n FROM app.vat_fixture_record WHERE tenant_id=$1", [verified.tenantId])).rows[0].n).toBe(0);
    await page.getByLabel("Customer end user").selectOption("false");
    // Execute the actual route, then lose its reply. Reload and retry must reuse the exact command.
    let loseReply = true;
    const transientRefusals = [408, 429];
    await page.route(`**${path}`, async route => {
      if (route.request().method() === "POST" && transientRefusals.length) {
        await route.fulfill({ status: transientRefusals.shift()!, contentType: "application/json", body: JSON.stringify({ message: "Retry the saved request." }) });
      } else if (route.request().method() === "POST" && loseReply) { loseReply = false; await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    const sent = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
    await page.getByRole("button", { name: "Store practice document", exact: true }).click();
    const original = (await sent).postDataJSON();
    // 408 and 429 preserve the same request, then a lost committed reply does too.
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(page.getByRole("button", { name: "Retry saved document unchanged" })).toBeEnabled();
      const retryRequest = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
      await page.getByRole("button", { name: "Retry saved document unchanged" }).click();
      expect((await retryRequest).postDataJSON()).toEqual(original);
    }
    await expect(page.getByRole("button", { name: "Retry saved document unchanged" })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole("button", { name: "Retry saved document unchanged" })).toBeEnabled();
    const resent = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(path));
    await page.getByRole("button", { name: "Retry saved document unchanged" }).click();
    expect((await resent).postDataJSON()).toEqual(original);
    await expect(page.getByRole("button", { name: "Store practice document", exact: true })).toBeEnabled();
    await page.reload();
    const stored = page.getByRole("region", { name: "Stored documents" });
    await expect(stored.getByRole("heading", { name: "VAT-PRACTICE-1 — interim" })).toBeVisible();
    await expect(stored).toContainText("vat.support-matrix.dark.v1");
    await expect(stored).toContainText("Reverse charge: customer to account for VAT to HMRC.");
    const expected = { Net: "10000p GBP", "Supplier VAT": "0p GBP", "Customer-accounted reverse-charge VAT": "1800p GBP", Gross: "10000p GBP", "Retained principal": "1000p GBP", "Expected cash": "9000p GBP" };
    for (const [label, figure] of Object.entries(expected)) await expect(stored.locator("dl").first().locator("div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd")).toHaveText(figure);
    await expect(stored).toContainText("real issue is disabled");
    await expect(page.locator("main")).toContainText("practice calculation, approved by no adviser");
    await expect(page.locator("main")).toContainText("fixture lineage, not proof");
    await expect(page.getByLabel("Fictional supplier reference")).toHaveCount(0);
    await expect(page.locator("form")).toContainText("Fictional builder");
    const headers = { cookie: `jobguard_session=${token}`, origin: baseURL!, "x-csrf-token": session.csrfToken, "x-tenant-id": verified.tenantId };
    const conflict = await page.request.post(path, { headers, data: { ...original, book: { ...original.book, customerReference: "changed" } } });
    expect(conflict.status()).toBe(409); expect((await conflict.json()).message).toContain("fixed fields");
    const saved = await new VatFixtureRepository(runtime).read(verified, job.id);
    expect(saved.records).toHaveLength(1); expect(saved.records[0]!.input.commandId).toBe(original.commandId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const control of await page.locator("main input, main select, main button").all()) {
      const box = await control.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  } finally { await runtime.end(); await admin.end(); await identity.provider.repository.pool.end(); }
});
