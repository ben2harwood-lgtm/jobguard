import { expect, test, type Page, type Locator, type Route } from "@playwright/test";
import { jobValueResponseV1, type JobValueResponse } from "../../api/src/value/contracts";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { button, click, jsonResult } from "./helpers/customer-invoice-journey";

test.setTimeout(240_000);
const notice = "Practice sandbox — synthetic data; nothing is sent or charged";
const failure = "Your job value could not load";
const loading = "Loading your persisted money position…";
const valuePath = (jobId: string) => `/api/jobs/${jobId}/value`;

async function prepare(page: Page) {
  // Existing UIWIRE capture/quote/acceptance/activation flow, through real services.
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const form = page.locator(".variation-entry");
  await form.getByLabel("Description", { exact: true }).fill("Recovery test extra preparation");
  await form.getByLabel("Variation price (£, optional)").fill("125.00");
  await click(page, "Add proposed variation");
  await expect(form.getByLabel("Description", { exact: true })).toHaveValue("");
  await click(page, "Approve exact revision");
  await expect(page.getByTestId("approved-additions")).toHaveText("£125.00");
  const snapshot = await read(page, jobId);
  expect(snapshot.approvedExtras.pence).toBe(12500);
  expect(snapshot.approvedExtras.sources).toHaveLength(1);
  expect(snapshot.quoteCoverage).toHaveLength(1);
  return { jobId, snapshot };
}

async function read(page: Page, jobId: string) {
  const result = jobValueResponseV1.parse(await jsonResult(page.request.get(valuePath(jobId)), "Read real value"));
  expect(result.jobId).toBe(jobId);
  return result;
}

function observeReads(page: Page) {
  const writes: string[] = [], reads: string[] = [];
  page.on("request", request => {
    if (!new URL(request.url()).pathname.startsWith("/api/")) return;
    if (request.method() !== "GET") writes.push(`${request.method()} ${request.url()}`);
    if (new URL(request.url()).pathname.endsWith("/value")) reads.push(request.method());
  });
  return { writes, reads };
}

async function accessible(page: Page) {
  const banner = page.getByRole("note", { name: "Practice sandbox notice", exact: true });
  await expect(banner).toHaveText(notice);
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function keyboardAction(page: Page, action: Locator) {
  // Reach the action with the keyboard so :focus-visible is exercised.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    if (await action.evaluate(el => el === document.activeElement)) break;
  }
  await expect(action).toBeFocused();
  const outline = await action.evaluate(el => {
    const css = getComputedStyle(el);
    return { style: css.outlineStyle, width: parseFloat(css.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThan(0);
  const box = await action.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function pending(page: Page) {
  await expect(page.getByRole("status")).toHaveText(loading);
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".value-card")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Job money position" })).toHaveCount(0);
  await accessible(page);
}

async function failed(page: Page) {
  await expect(page.locator("main").getByRole("alert")).toHaveText(failure);
  await expect(page.locator(".value-card")).toHaveCount(0);
  await expect(page.getByText(loading, { exact: true })).toHaveCount(0);
  await accessible(page);
}

async function ready(page: Page, snapshot: JobValueResponse) {
  await expect(page.getByRole("heading", { name: "How JobGuard helps protect your money", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Back to job", exact: true })).toHaveAttribute("href", `/jobs/${snapshot.jobId}`);
  await expect(page.getByTestId("value-approved-extras")).toHaveText(snapshot.approvedExtras.pence === null ? "No recorded outcome yet" : "£125.00");
  for (const source of snapshot.approvedExtras.sources) {
    const link = page.locator(".value-card").getByRole("link", { name: `${source.label} · source ${source.id}`, exact: true });
    await expect(link).toHaveAttribute("href", source.href);
  }
  for (const source of snapshot.quoteCoverage) {
    await expect(page.getByRole("link", { name: `${source.label} · source ${source.id}`, exact: true })).toHaveAttribute("href", source.href);
  }
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await accessible(page);
}

// Delay transport only. Every released success uses route.continue() and the real
// persisted backend. No fulfilled success, foreign job payload or end-state seed.
async function holdNextRead(page: Page, jobId: string, outcome: "continue" | "abort" = "continue") {
  let signal!: () => void, release!: () => void, finish!: () => void;
  const arrived = new Promise<void>(resolve => { signal = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const handler = async (route: Route) => {
    signal(); await gate;
    if (outcome === "abort") await route.abort("failed");
    else await route.continue();
    finish();
  };
  await page.route(`**${valuePath(jobId)}`, handler, { times: 1 });
  return { arrived, release, finished };
}

async function nextRealResponse(page: Page, jobId: string, action: () => Promise<unknown>) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === valuePath(jobId) && r.request().method() === "GET");
  await action();
  const result = await response;
  expect(result.ok()).toBe(true);
  const parsed = jobValueResponseV1.parse(await result.json());
  expect(parsed.jobId).toBe(jobId);
  return parsed;
}

async function paint(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function reloadAndReopen(page: Page, jobId: string, snapshot: JobValueResponse) {
  await nextRealResponse(page, jobId, () => page.reload());
  await ready(page, snapshot);
  await page.goto("/");
  await page.locator(`.job-card a[href="/jobs/${jobId}"]`).click();
  await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", jobId);
  const fresh = await nextRealResponse(page, jobId, () => page.goto(`/jobs/${jobId}/value`));
  expect(fresh).toEqual(snapshot);
  await ready(page, fresh);
}

test("initial pending, transport/HTTP/JSON/schema failures and GET-only recovery keep facts honest", async ({ page }) => {
  const { jobId, snapshot } = await prepare(page);
  const observed = observeReads(page);
  // Negative transport injection: delay then abort the initial read.
  const initial = await holdNextRead(page, jobId, "abort");
  await page.goto(`/jobs/${jobId}/value`);
  await initial.arrived;
  try {
    await pending(page);
    // An unrelated shell control must retain focus on an automatic error.
    await page.evaluate(() => {
      const control = document.createElement("button");
      control.id = "unrelated-control"; control.textContent = "Unrelated shell control";
      document.body.append(control); control.focus();
    });
    initial.release();
    await failed(page);
    await expect(page.locator("#unrelated-control")).toBeFocused();
    await page.locator("#unrelated-control").evaluate(el => el.remove());
  } finally { initial.release(); }

  // Explicitly faulty negative responses only; never a forged successful value.
  for (const fault of [
    { label: "HTTP", status: 503, body: '{"code":"DATABASE_UNAVAILABLE"}' },
    { label: "JSON", status: 200, body: "{" },
    { label: "schema", status: 200, body: '{"version":"job-value.v1"}' },
  ]) {
    await test.step(`negative ${fault.label} response`, async () => {
      await page.route(`**${valuePath(jobId)}`, route => route.fulfill({ status: fault.status, contentType: "application/json", body: fault.body }), { times: 1 });
      await keyboardAction(page, button(page, "Try again"));
      await page.keyboard.press("Enter");
      await failed(page);
      await expect(page.getByRole("heading", { name: failure, exact: true })).toBeFocused();
    });
  }
  await keyboardAction(page, button(page, "Try again"));
  const fresh = await nextRealResponse(page, jobId, () => page.keyboard.press("Enter"));
  expect(fresh).toEqual(snapshot);
  await ready(page, fresh);
  expect(observed.reads.length).toBeGreaterThanOrEqual(5);
  expect(observed.reads.every(method => method === "GET")).toBe(true);
  expect(observed.writes).toEqual([]);
  await reloadAndReopen(page, jobId, snapshot);
});

test("refresh hides old figures; only the latest real read or failure may publish", async ({ page }) => {
  const { jobId, snapshot } = await prepare(page);
  await nextRealResponse(page, jobId, () => page.goto(`/jobs/${jobId}/value`));
  await ready(page, snapshot);
  const observed = observeReads(page);
  const older = await holdNextRead(page, jobId);
  await keyboardAction(page, button(page, "Refresh persisted facts"));
  await page.keyboard.press("Enter");
  await older.arrived;
  await pending(page);
  const latest = await holdNextRead(page, jobId);
  await click(page, "Refresh persisted facts");
  await latest.arrived;
  try {
    // The older real success must not clear the newest request's pending state.
    await nextRealResponse(page, jobId, async () => older.release());
    await paint(page);
    await pending(page);
    const fresh = await nextRealResponse(page, jobId, async () => latest.release());
    expect(fresh).toEqual(snapshot);
    await ready(page, fresh);
  } finally { older.release(); latest.release(); }

  // A pending and then failed refresh must never expose the previous money cards.
  const failedRefresh = await holdNextRead(page, jobId, "abort");
  await click(page, "Refresh persisted facts");
  await failedRefresh.arrived;
  try {
    await pending(page);
    failedRefresh.release();
    await failed(page);
    await nextRealResponse(page, jobId, () => click(page, "Try again"));
    await ready(page, snapshot);
  } finally { failedRefresh.release(); }
  // A superseded transport failure must not erase a newer real success.
  const oldFailure = await holdNextRead(page, jobId, "abort");
  await click(page, "Refresh persisted facts");
  await oldFailure.arrived;
  try {
    await nextRealResponse(page, jobId, () => click(page, "Refresh persisted facts"));
    await ready(page, snapshot);
    oldFailure.release(); await oldFailure.finished; await paint(page);
    await ready(page, snapshot);
  } finally { oldFailure.release(); }
  expect(observed.writes).toEqual([]);
  await reloadAndReopen(page, jobId, snapshot);
});

test("a delayed real job A read cannot replace job B after client navigation", async ({ page }) => {
  const { jobId: jobA, snapshot: snapshotA } = await prepare(page);
  const jobs = await jsonResult(page.request.get("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111"), "Read session jobs");
  const jobB = (jobs.jobs ?? jobs).find((job: { title: string }) => job.title === "Earlier proposed pricing (v1)").id as string;
  expect(jobB).not.toBe(jobA);
  const snapshotB = await read(page, jobB);
  expect(snapshotB.approvedExtras.pence).toBeNull();
  await nextRealResponse(page, jobA, () => page.goto(`/jobs/${jobA}/value`));
  await ready(page, snapshotA);
  const observed = observeReads(page);
  const held = await holdNextRead(page, jobA);
  await click(page, "Refresh persisted facts");
  await held.arrived;
  try {
    await pending(page);
    // Use Next's existing debug router (present in pinned 15.5.28) to navigate
    // without a document reload, keeping the outstanding real fetch alive.
    const freshB = await nextRealResponse(page, jobB, () => page.evaluate(path => {
      const runtime = window as unknown as { next: { router: { push: (url: string) => void } } };
      runtime.next.router.push(path);
    }, `/jobs/${jobB}/value`));
    expect(freshB).toEqual(snapshotB);
    await ready(page, snapshotB);
    const lateA = await nextRealResponse(page, jobA, async () => held.release());
    expect(lateA).toEqual(snapshotA);
    await paint(page);
    await ready(page, snapshotB);
    await expect(page.locator(".value-card a")).toHaveCount(0);
    expect(observed.writes).toEqual([]);
  } finally { held.release(); }
  await reloadAndReopen(page, jobB, snapshotB);
});
