import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_TENANT_ID as tenantId } from "@jobguard/db";
import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.V2_TEST_ORIGIN, "Requires the embedded V2 launcher and real PostgreSQL.");
const tiling = "Fit and grout kitchen splashback tiles";
const shots = fileURLToPath(new URL("./artifacts/v2-d5b", import.meta.url));
async function call<T>(page: Page, path: string, body?: unknown): Promise<T> {
  const result = await page.evaluate(async ([url, input]) => {
    const response = await fetch(url, input === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }, [path, body] as const);
  expect(result.status, JSON.stringify(result.body)).toBeLessThan(300);
  return result.body as T;
}
async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
  await page.getByLabel("What do you want to do?").selectOption("signin");
  await page.getByRole("button", { name: "Request code" }).click();
  await expect(page.getByTestId("fixture-code")).toHaveText(/^[0-9]{8}$/u);
  await page.getByLabel("Eight-digit code").fill(await page.getByTestId("fixture-code").innerText());
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/practice-company$/u);
}
const card = (page: Page) => page.locator("#work-materials");
async function capture(page: Page, state: string, width: number) {
  expect(await page.locator("#main").evaluate(main => main.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: resolve(shots, `${state}-${width}.png`), fullPage: true, animations: "disabled",
    style: "nextjs-portal, .rr-mobile-nav, #work-plan, #work-measurements, #work-materials ~ * { display: none !important; }" });
}

test("D5B-M measurements to products to unsent enquiry, persisted with stale and clash states", async ({ page, baseURL }) => {
  const outbound: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== baseURL || request.method() === "POST" && /\/(send|execute|order|payment)(\/|$)/u.test(url.pathname)) outbound.push(url.href);
  });
  await signIn(page);
  const { jobs } = await call<{ jobs: { id: string; title: string }[] }>(page, `/api/jobs?tenantId=${tenantId}`);
  const jobId = jobs.find(job => job.title === "Occupied-home kitchen splashback and hall decorating")!.id;
  const path = `/api/v2-backend/jobs/${jobId}/materials`;
  await page.goto(`/jobs/${jobId}/work`);
  const measured = page.locator("#work-measurements").getByRole("article").filter({ has: page.getByRole("heading", { name: tiling }) });
  await measured.getByRole("button", { name: /^(Confirm|Change) measurement /u }).click();
  await measured.getByLabel("Measured quantity").fill("6");
  await measured.getByLabel("Unit", { exact: true }).fill("m2");
  await measured.getByRole("button", { name: "Confirm measurement", exact: true }).click();
  await expect(measured.getByText("Confirmed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(card(page).getByRole("heading", { name: "Materials", exact: true })).toBeVisible();
  const view = await call<{ scope: { scopeItemId: string; description: string }[] }>(page, path);
  const scopeItemId = view.scope.find(item => item.description === tiling)!.scopeItemId;
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await card(page).getByLabel("Add product for").selectOption(scopeItemId);
    await card(page).getByLabel("Product", { exact: true }).fill(`Fictional tiles ${width}`);
    await card(page).getByLabel("Pack size", { exact: true }).fill("1.2");
    await card(page).getByLabel("Pack unit", { exact: true }).fill("m2");
    await card(page).getByLabel(/Firm's wastage multiplier/u).fill("1.10");
    await card(page).getByLabel(/Confirmed usable whole packs/u).fill("1");
    await card(page).getByLabel("Supplier", { exact: true }).fill("Fictional merchant");
    await card(page).getByLabel("Needed by", { exact: true }).fill("2026-12-01");
    await card(page).getByLabel("Enquiry notes").fill("Check compatible batch");
    await capture(page, "edit", width);
    await card(page).getByRole("button", { name: "Save material", exact: true }).click();
    await expect(card(page).getByRole("status").filter({ hasText: "Material saved." })).toBeVisible();
    await page.reload();
    const row = card(page).getByRole("article").filter({ has: page.getByRole("heading", { name: `Fictional tiles ${width}`, exact: true }) });
    await expect(row).toContainText("6 packs including allowance · 1 on site · 5 short");
    await expect(row).toContainText("Check compatible batch");
    await card(page).getByRole("button", { name: /^(View|Regenerate) enquiry$/u }).click();
    await expect(card(page).getByRole("region", { name: "Stock enquiry" })).toContainText("5 packs requested");
    await capture(page, "enquiry", width);
    await row.getByRole("button", { name: `Edit material Fictional tiles ${width}` }).click();
    await row.getByLabel("Builder's corrected pack count (optional)").fill("8");
    await row.getByRole("button", { name: "Save material" }).click();
    await expect(card(page).getByText("Out of date", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: `Edit material Fictional tiles ${width}` }).click();
    await row.getByLabel("Pack size", { exact: true }).fill("2");
    // Changing an input must retain, rather than silently re-approve, the builder's correction.
    await row.getByRole("button", { name: "Save material" }).click();
    await expect(row).toContainText("Clashing edit");
    await capture(page, "clash", width);
    await row.getByRole("button", { name: `Edit material Fictional tiles ${width}` }).click();
    const state = await call<{ lines: { scopeItemId: string; lineKey: string; version: number; product: string }[] }>(page, path);
    const line = state.lines.find(item => item.product === `Fictional tiles ${width}`)!;
    await call(page, path, { version: "v2-material-line-command.v1", commandId: randomUUID(), scopeItemId,
      lineKey: line.lineKey, expectedVersion: line.version, changes: { notes: "Changed in another tab" } });
    await row.getByRole("button", { name: "Save material" }).click();
    await expect(card(page).getByRole("alert")).toContainText("Your change was not saved");
    await capture(page, "stale", width);
    await card(page).getByRole("button", { name: "Reload materials", exact: true }).click();
    await expect(row).toContainText("Clashing edit");
    await capture(page, "clash", width);
    await row.getByRole("button", { name: `Edit material Fictional tiles ${width}` }).click();
    await row.getByLabel("Who supplies").selectOption("customer");
    await row.getByRole("button", { name: "Save material" }).click();
    await expect(card(page).getByRole("status").filter({ hasText: "Material saved." })).toBeVisible();
    await page.reload();
    await expect(card(page).locator("section").filter({ has: page.getByRole("heading", { name: "Customer-supplied items", exact: true }) }).getByRole("article").filter({ hasText: `Fictional tiles ${width}` })).toBeVisible();
  }
  // A measured scope can have a material whose pack size is still unknown.
  const pendingProduct = `Fictional pending pack ${randomUUID()}`;
  await card(page).getByLabel("Add product for").selectOption(scopeItemId);
  await card(page).getByLabel("Product", { exact: true }).fill(pendingProduct);
  await card(page).getByRole("button", { name: "Save material", exact: true }).click();
  await expect(card(page).getByText("Material saved.", { exact: true })).toBeVisible();
  await page.reload();

  const pendingRow = card(page).getByRole("article").filter({ has: page.getByRole("heading", { name: pendingProduct }) });
  await pendingRow.getByRole("button", { name: `Edit material ${pendingProduct}` }).click();
  await expect(pendingRow.getByLabel("Pack size", { exact: true })).toHaveValue("");
  await expect(pendingRow.getByLabel("Pack unit", { exact: true })).toHaveValue("");
  await pendingRow.getByLabel("Enquiry notes").fill("Waiting for merchant pack details");
  await pendingRow.getByRole("button", { name: "Save material", exact: true }).click();
  await expect(card(page).getByText("Material saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(pendingRow).toContainText("Waiting for merchant pack details");
  await expect(pendingRow).toContainText("Enter the pack size");
  expect(outbound).toEqual([]);
});

test("empty, problem and matching mock states at both widths", async ({ page }) => {
  await signIn(page);
  const { jobId } = await call<{ jobId: string }>(page, "/api/jobs/capture", {
    contractVersion: "job_capture_v1", requested_tenant_id: tenantId, captureId: randomUUID(),
    fixtureId: "v2-d5b-browser", source: { kind: "text", text: "JOB: Fictional empty materials" },
  });
  const path = `/api/v2-backend/jobs/${jobId}/materials`;
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/jobs/${jobId}/work`);
    await expect(card(page).getByRole("heading", { name: "No materials yet" })).toBeVisible();
    await capture(page, "empty", width);
    await page.route(path, route => route.fulfill({ status: 503, json: { code: "MATERIALS_UNAVAILABLE" } }));
    await page.reload();
    await expect(card(page).getByRole("alert")).toContainText("Materials could not open. Your job is unchanged.");
    await capture(page, "problem", width);
    await page.unroute(path);
    await page.goto("/v2-mock");
    await page.getByRole("navigation", { name: "Work screens" }).getByRole("button", { name: "Materials" }).click();
    await capture(page, "mock-example", width);
    await page.getByRole("button", { name: /Edit material /u }).first().click();
    await capture(page, "mock-edit", width);
    await page.getByLabel("Preview state").selectOption("Empty");
    await capture(page, "mock-empty", width);
    await page.getByLabel("Preview state").selectOption("Problem");
    await capture(page, "mock-problem", width);
  }
});
