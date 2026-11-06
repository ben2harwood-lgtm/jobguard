import { test, expect } from "@playwright/test";
// Transport rendering test only. The application/PostgreSQL suite proves stored
// facts, signatures and access; run this spec in mobile-360 and desktop projects.
test("practice history renders server states in order and survives refresh and event replay", async ({ page }) => {
  const id = "10000000-0000-4000-8000-000000000001";
  const labels = ["Mandate created", "Mandate awaiting submission", "Mandate active", "Payment requested — not paid",
    "Payment submitted — not paid", "Payment failed", "Payment requested — not paid", "Payment submitted — not paid",
    "Collection confirmed — awaiting payout", "Payment paid out", "Payment charged back", "Payment requested — not paid",
    "Payment cancelled", "Payment requested — not paid", "Collection confirmed — awaiting payout", "Payment failed after confirmation",
    "Mandate cancelled or revoked"];
  let count = 0;
  const view = () => ({ version: "debit-practice-view.v1", mandate: count === labels.length ? labels.at(-1) : count >= 3 ? "Mandate active" : count ? labels[count - 1] : "No practice mandate created",
    blocksNewCollection: count < 3 || count === labels.length,
    history: labels.slice(0, count).map((label, i) => ({ sequence: i + 1, label, current: i + 1 === count })),
    payments: count >= 4 ? [{ label: "Practice payment 1", state: count < 6 ? labels[count - 1] : "Payment failed" }] : [],
    nextAction: count < labels.length ? { version: "debit-practice-action.v1", step: count } : null });
  await page.route(`**/api/jobs/${id}/direct-debit-practice`, async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { step: number };
      if (body.step === count) count++;
    }
    await route.fulfill({ contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(view()) });
  });
  await page.goto(`/jobs/${id}/direct-debit-practice`);
  const main = page.getByRole("main");
  await expect(main.getByText(/No bank or real Direct Debit/)).toBeVisible();
  for (let n = 0; n < labels.length; n++) {
    await main.getByRole("button", { name: "Show next practice event" }).click();
    await expect(main.locator("li").last()).toHaveText(`${labels[n]} (current)`);
    if (n === 3) await expect(main.getByText("Practice payment 1: Payment requested — not paid", { exact: true })).toBeVisible();
  }
  await expect(main.getByText("New collection blocked by mandate state.", { exact: true })).toBeVisible();
  const history = await main.locator("li").allTextContents();
  await page.reload();
  await expect(main.locator("li")).toHaveText(history);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(main.getByRole("button", { name: "Practice sequence complete" })).toBeDisabled();
});

test("saved session practice uses the real application and survives refresh, replay and a foreign session", async ({ page, browser, baseURL }) => {
  expect((await page.request.post("/api/session")).ok()).toBe(true);
  const session = await (await page.request.get("/api/session")).json() as { tenants: { id: string }[] };
  const jobsResponse = await page.request.get(`/api/jobs?tenantId=${session.tenants[0]!.id}`);
  expect(jobsResponse.ok()).toBe(true);
  const jobs = await jobsResponse.json() as { jobs: { id: string }[] };
  const id = jobs.jobs[0]!.id, path = `/api/jobs/${id}/direct-debit-practice`;
  await page.goto(`/jobs/${id}/direct-debit-practice`);
  const main = page.getByRole("main");
  for (let n = 0; n < 17; n++) {
    await main.getByRole("button", { name: "Show next practice event" }).click();
    await expect(main.locator("li")).toHaveCount(n + 1);
    if (n === 3) await expect(main.getByText("Practice payment 1: Payment requested — not paid", { exact: true })).toBeVisible();
  }
  await expect(main.getByText("New collection blocked by mandate state.", { exact: true })).toBeVisible();
  const saved = await (await page.request.get(path)).json();
  const replay = await page.request.post(path, { headers: { origin: new URL(page.url()).origin }, data: { version: "debit-practice-action.v1", step: 0 } });
  expect(replay.ok()).toBe(true); expect(await replay.json()).toEqual(saved);
  const history = await main.locator("li").allTextContents();
  await page.reload(); await expect(main.locator("li")).toHaveText(history);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const foreign = await browser.newContext(baseURL ? { baseURL } : {});
  try {
    expect((await foreign.request.post("/api/session")).ok()).toBe(true);
    const denied = await foreign.request.get(path);
    expect(denied.status()).toBe(404); expect(await denied.json()).toEqual({ code: "NOT_FOUND" });
  } finally { await foreign.close(); }
});
