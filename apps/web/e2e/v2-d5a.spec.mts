import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_TENANT_ID as tenantId } from "@jobguard/db";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.skip(!process.env.V2_TEST_ORIGIN, "Requires the embedded V2 launcher.");

const widths = [360, 1280] as const;
const tiling = "Fit and grout kitchen splashback tiles";
const decorating = "Protect, prepare and paint the hall walls and trim";
const shots = fileURLToPath(new URL("./artifacts/v2-d5a", import.meta.url));

type Row = { scopeItemId: string; version: number; status: string; quoted: { description: string } | null;
  measurement: { quantity: string; unit: string; confirmed: boolean } | null };

type Reply = { status: number; body: unknown };

// Call the app from the page itself, so the browser's own cookie rules apply on both the loopback and phone origins.
async function call(page: Page, path: string, data?: unknown): Promise<Reply> {
  return page.evaluate(async ([target, payload]) => {
    const response = await fetch(target, payload === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  }, [path, data] as const);
}

async function json<T>(reply: Promise<Reply>): Promise<T> {
  const { status, body } = await reply;
  expect(status < 300, JSON.stringify(body)).toBe(true);
  return body as T;
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Fictional email address").fill("builder@jobguard-v2.invalid");
  await page.getByLabel("What do you want to do?").selectOption("signin");
  await page.getByRole("button", { name: "Request code" }).click();
  const code = page.getByTestId("fixture-code");
  await expect(code).toHaveText(/^[0-9]{8}$/u);
  await page.getByLabel("Eight-digit code").fill(await code.innerText());
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/practice-company$/u);
}

function trackRequests(page: Page, origin: string) {
  const outside: string[] = [];
  const browserSends: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== origin) outside.push(url.href);
    if (request.method() === "POST" && /\/(send|execute|order|payment)(\/|$)/u.test(url.pathname)) {
      browserSends.push(url.pathname);
    }
  });
  return () => {
    expect(outside).toEqual([]);
    expect(browserSends).toEqual([]);
  };
}

let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL: baseURL!, ignoreHTTPSErrors: true, viewport: { width: 360, height: 800 } });
  try {
    const checkRequests = trackRequests(page, baseURL!);
    await signIn(page);
    cookies = await page.context().cookies();
    checkRequests();
  } finally {
    await page.close();
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

async function capture(page: Page, name: string, width: number, reference = false) {
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.locator("#main").evaluate(main => main.scrollWidth)).toBeLessThanOrEqual(width);
  // Keep the job chrome and the Measurements card. Leave the Plan and the existing workspace out of the comparison.
  await page.screenshot({
    path: resolve(shots, `${reference ? "mock" : "measurements"}-${name}-${width}.png`),
    fullPage: true,
    animations: "disabled",
    style: "nextjs-portal, .rr-mobile-nav, #work-plan, #work-measurements ~ * { display: none !important; }",
  });
}

const card = (page: Page) => page.locator("#work-measurements");
const row = (page: Page, title: string) => card(page).getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });
const measurementsPath = (jobId: string) => `/api/v2-backend/jobs/${jobId}/measurements`;

async function seededJob(page: Page) {
  const { jobs } = await json<{ jobs: { id: string; title: string }[] }>(call(page, `/api/jobs?tenantId=${tenantId}`));
  const job = jobs.find(entry => entry.title === "Occupied-home kitchen splashback and hall decorating");
  expect(job).toBeDefined();
  return job!.id;
}

test("the builder answers measurement questions at both widths and they survive reload", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const checkRequests = trackRequests(page, baseURL!);
  await page.goto("/sign-in");
  const jobId = await seededJob(page);
  const path = measurementsPath(jobId);
  await page.goto(`/jobs/${jobId}/work`);
  await expect(card(page).getByRole("article")).toHaveCount(2);

  const answers = [
    { title: tiling, quantity: "6.4", unit: "m2", shown: "6.4 m2", quote: "Quote says 6 m2" },
    { title: decorating, quantity: "24", unit: "m²", shown: "24 m²", quote: "Quote says 1 item" },
  ];
  for (const [index, width] of widths.entries()) {
    const answer = answers[index]!;
    await page.setViewportSize({ width, height: 800 });
    const item = row(page, answer.title);
    await expect(item.getByText("Needs your answer")).toBeVisible();
    await expect(item).toContainText(`What did you measure for “${answer.title}”?`);
    // The accepted quote revision's line, not the captured scope, is what the quote says.
    await expect(item).toContainText(`No measurement yet · ${answer.quote}`);
    await capture(page, "question", width);
    await item.getByRole("button", { name: `Confirm measurement ${answer.title}` }).click();
    await item.getByLabel("Measured quantity").fill("06");
    await item.getByRole("button", { name: "Confirm measurement", exact: true }).click();
    await expect(item.getByRole("alert")).toContainText("Enter a number above zero");
    await item.getByLabel("Measured quantity").fill(answer.quantity);
    await item.getByLabel("Unit").fill(answer.unit);
    await capture(page, "edit", width);
    const response = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
    await item.getByRole("button", { name: "Confirm measurement", exact: true }).click();
    const saved = await response;
    expect(saved.ok(), await saved.text()).toBe(true);
    expect(saved.request().postDataJSON()).toMatchObject({ version: "v2-measurement-command.v1", commandId: expect.any(String),
      expectedVersion: 0, quantity: answer.quantity, unit: answer.unit, confirmed: true });
    await expect(card(page).getByText(`Measurement saved for ${answer.title}.`)).toBeVisible();
    await page.reload();
    const reloaded = row(page, answer.title);
    await expect(reloaded.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(reloaded).toContainText(`${answer.shown} · Typed by the builder`);
    await expect(reloaded.getByRole("button", { name: `Change measurement ${answer.title}` })).toBeVisible();
    await capture(page, "confirmed", width);
  }

  // A second request confirms a new value while the browser still holds the earlier version.
  const item = row(page, tiling);
  await item.getByRole("button", { name: `Change measurement ${tiling}` }).click();
  const { items } = await json<{ items: Row[] }>(call(page, path));
  const seen = items.find(entry => entry.quoted?.description === tiling)!;
  expect(seen).toMatchObject({ version: 1, status: "confirmed", measurement: { quantity: "6.4", unit: "m2", confirmed: true } });
  const command = { version: "v2-measurement-command.v1", scopeItemId: seen.scopeItemId, commandId: randomUUID(),
    expectedVersion: seen.version, quantity: "6.5", unit: "m2", confirmed: true };
  const receipt = await json(call(page, path, command));
  expect(await json(call(page, path, command))).toEqual(receipt);
  expect((await call(page, path, { ...command, quantity: "7" })).status).toBe(409);
  await item.getByLabel("Measured quantity").fill("9");
  const refused = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
  await item.getByRole("button", { name: "Confirm measurement", exact: true }).click();
  expect((await refused).status()).toBe(409);
  await expect(card(page).getByRole("alert")).toContainText("This measurement changed since you opened it. Your change was not saved.");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "stale", width);
  }
  await card(page).getByRole("button", { name: "Reload measurements" }).click();
  await expect(row(page, tiling)).toContainText("6.5 m2 · Typed by the builder");
  await expect(card(page).getByText(/\b9 m2\b/u)).toHaveCount(0);
  checkRequests();
});

test("empty and problem states match the checked mock-up at both widths", async ({ page, baseURL }) => {
  const checkRequests = trackRequests(page, baseURL!);
  await page.goto("/sign-in");
  const { jobId } = await json<{ jobId: string }>(call(page, "/api/jobs/capture", {
    contractVersion: "job_capture_v1", requested_tenant_id: tenantId, captureId: randomUUID(),
    fixtureId: "v2-d5a-browser", source: { kind: "text", text: "JOB: Fictional job with no scope yet" },
  }));
  await page.goto(`/jobs/${jobId}/work`);
  await expect(card(page).getByRole("heading", { name: "No measurements yet" })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "empty", width);
  }

  // Inject a read outage only. Every write in the other test used real PostgreSQL.
  const seeded = await seededJob(page);
  const path = measurementsPath(seeded);
  await page.route(path, route => route.fulfill({ status: 503, json: { code: "MEASUREMENT_UNAVAILABLE" } }));
  await page.goto(`/jobs/${seeded}/work`);
  await expect(card(page).getByRole("alert")).toContainText("Measurements could not open. Your job is unchanged.");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "problem", width);
  }
  await page.unroute(path);
  await card(page).getByRole("button", { name: "Reload measurements" }).click();
  await expect(card(page).getByRole("article")).toHaveCount(2);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/v2-mock");
    await page.getByRole("navigation", { name: "Work screens" }).getByRole("button", { name: "Measurements" }).click();
    await expect(page.getByText("Paint hall woodwork")).toBeVisible();
    await capture(page, "example", width, true);
    await page.getByRole("button", { name: "Confirm measurement Paint hall woodwork" }).click();
    await capture(page, "edit", width, true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const preview = page.getByLabel("Preview state");
    await preview.selectOption("Empty");
    await capture(page, "empty", width, true);
    await preview.selectOption("Problem");
    await capture(page, "problem", width, true);
  }
  checkRequests();
});
