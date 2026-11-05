import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { E2E_RUNTIME_URL, E2E_AUTH_CODE_SECRET } from "./global-setup";
// Keep the built ESM package graph out of Playwright's source loader (CH-9).
const nativeImport = new Function("specifier", "return import(specifier)") as <T>(specifier: string) => Promise<T>;
test("stored CIS practice statement survives reload and corrections append, without claiming verification", async ({ page, context, baseURL }) => {
  const db = await nativeImport<typeof import("@jobguard/db")>(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
  const api = await nativeImport<typeof import("@jobguard/api/identity")>(pathToFileURL(join(process.cwd(), "../api/dist/auth/index.js")).href);
  const identityPool = new Pool({ connectionString: "postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo", max: 1 });
  const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
  try {
    const identity = new api.IdentityApplication(new api.PersistedAuthProvider(new db.IdentityRepository(identityPool), E2E_AUTH_CODE_SECRET), baseURL!);
    const email = `${randomUUID()}@cis-fixture.invalid`;
    const challenge = await identity.provider.requestCode({ email, purpose: "signup", ip: randomUUID() });
    const session = await identity.provider.verifyCode(email, "signup", challenge.fixtureCode!);
    const membership = (await identity.session(session.sessionToken)).memberships[0]!;
    const verified = await identity.context({ ...session, origin: baseURL!, tenantHeader: membership.tenantId });
    const captureId = randomUUID(), text = "Fictional CIS practice job";
    const provenance = { kind: "extracted" as const, span: { sourceId: captureId, sourceVersion: 1 as const, start: 0, end: text.length } };
    // Seed through the repository, never a seed route or owner SQL writes.
    const job = await new db.CaptureRepository(runtime).persist(verified, { captureId, text, promptVersion: "cis-e2e.v1", schemaVersion: "cis-e2e.v1", model: "fixture-only",
      proposal: { title: { value: text, provenance }, lines: [{ description: { value: text, provenance }, quantity: { value: "1", provenance }, unit: { value: "item", provenance },
        unitPricePence: { value: null, provenance: { kind: "defaulted", note: "Fictional unpriced line" } } }], materials: [], questions: [] } });
    await context.addCookies([{ name: "jobguard_session", value: session.sessionToken, url: baseURL! }]);
    await page.goto(`/jobs/${job.job_id as string}/cis-fixtures`);
    const main = page.getByRole("main");
    await expect(main.getByText("Practice calculation. Approved by no adviser. Nothing is submitted to HMRC.")).toBeVisible();
    await main.getByLabel("Statement reference", { exact: true }).fill("Fictional CIS first");
    await main.getByRole("button", { name: "Store practice statement", exact: true }).click();
    await expect(main.getByRole("alert")).toContainText(/status|inputs/iu);
    await main.getByLabel("Fictional status record").selectOption("registered");
    await main.getByLabel("Fixture valid through", { exact: true }).fill("2026-10-30");
    await main.getByRole("button", { name: "Store practice statement", exact: true }).click();
    await expect(main.getByRole("alert")).toContainText("stale");
    await main.getByLabel("Fixture valid through", { exact: true }).fill("2026-11-05");
    await main.getByLabel("New payment reference (blank for no new cash)", { exact: true }).fill("Fictional payment first");
    await main.getByLabel("New actual cash (pence)", { exact: true }).fill("3400");
    await main.getByRole("button", { name: "Store practice statement", exact: true }).click();
    const first = main.getByRole("region", { name: "Statement Fictional CIS first", exact: true });
    await expect(first).toBeVisible();
    await page.reload(); await expect(first).toBeVisible();
    for (const [label, value] of [["Invoice net", "£100.00"], ["Supplier VAT", "£20.00"], ["Reverse-charge VAT", "£0.00"], ["Retention", "£10.00"],
      ["CIS deduction (not unpaid debt)", "£6.00"], ["Actual cash", "£34.00"], ["Remaining allocated cash", "£0.00"], ["Fee-eligible recovery", "£0.00"]]) {
      await expect(first.locator("dl > div").filter({ has: page.getByText(label!, { exact: true }) }).locator("dd")).toHaveText(value!);
    }
    await expect(main.getByRole("button", { name: "Issue statement — disabled", exact: true })).toBeDisabled();
    const original = await first.textContent();
    await main.getByLabel("Statement reference", { exact: true }).fill("Fictional correction");
    await main.getByLabel("Statement kind").selectOption("correction");
    await main.getByLabel("Cumulative paid net (pence)", { exact: true }).fill("2000");
    await main.getByRole("button", { name: "Store practice statement", exact: true }).click();
    await expect(main.getByRole("region", { name: "Statement Fictional correction", exact: true })).toBeVisible();
    expect(await first.textContent()).toBe(original);
    await page.reload(); await expect(first).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const target of await main.locator("input,select,button").all()) {
      const bounds = await target.boundingBox(); if (bounds) { expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.width).toBeGreaterThanOrEqual(44); }
    }
  } finally { await runtime.end(); await identityPool.end(); }
});
