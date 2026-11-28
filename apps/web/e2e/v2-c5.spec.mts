import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { M1_QUOTE_POLICY } from "@jobguard/core";
import { DEMO_TENANT_ID as tenantId } from "@jobguard/db";
import { expect, test, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

test.skip(!process.env.V2_TEST_ORIGIN, "Requires the running V2 launcher.");

const widths = [360, 1280] as const;
const shots = fileURLToPath(new URL("./artifacts/v2-c5", import.meta.url));

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
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
  const sends: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== origin) outside.push(url.href);
    if (request.method() === "POST" && /\/(delivery|send|execute|order|payment)(\/|$)/u.test(url.pathname)) sends.push(url.pathname);
  });
  return () => {
    expect(outside).toEqual([]);
    expect(sends).toEqual([]);
  };
}

let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL: baseURL!, ignoreHTTPSErrors: true, viewport: { width: 360, height: 800 } });
  try {
    await signIn(page);
    await page.waitForLoadState("networkidle");
    cookies = await page.context().cookies();
  } finally {
    await page.close();
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

async function openQuote(page: Page, jobId: string) {
  await page.goto(`/jobs/${jobId}/work`);
  await page.getByRole("button", { name: "Price the work" }).click();
}

async function captured(page: Page, fixtureId: string) {
  return json<{
    jobId: string; proposalId: string; reviewId: string; proposal: {
      lines: { id: string; scopeItemId: string; description: { value: string }; quantity: { value: string };
        unit: { value: string }; unitPricePence: { value: number }; sourceExcerpt: string }[];
      questions: { question: { value: string } }[];
    };
  }>(await page.request.post("/api/jobs/capture", { data: {
    contractVersion: "job_capture_v1", requested_tenant_id: tenantId, captureId: randomUUID(), fixtureId,
    source: { kind: "text", text: "JOB: Fictional splashback and hall\nITEM: Tile the splashback | QTY: 6 | UNIT: m2 | RATE: £95.00\nITEM: Paint the hall walls and trim | QTY: 1 | UNIT: item | RATE: £640.00\nITEM: Skip hire | QTY: 1 | UNIT: item | RATE: £240.00" },
  } }));
}

// A fresh splashback and hall quote, priced but not yet sent.
async function quotingJob(page: Page) {
  const { jobId, proposalId, reviewId, proposal } = await captured(page, "v2-c5-browser");
  const jobApi = `/api/jobs/${jobId}`;
  const { review } = await json<{ review: { revision: number } }>(await page.request.post(`${jobApi}/review`, { data: {
    contractVersion: "proposal_review_command_v1", expectedRevision: 0,
    review: {
      version: "proposal_review_v1", jobId, proposalId, reviewId, revision: 0,
      lines: proposal.lines.map((line, index) => ({
        id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
        room: index === 0 ? "Kitchen" : "Hall", category: index === 0 ? "Tiling" : "Decorating", quantity: line.quantity.value,
        unit: line.unit.value, unitPricePence: line.unitPricePence.value, disposition: "accepted", dismissalReason: null,
        parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt,
      })),
      questions: proposal.questions.map(({ question }) => ({
        id: randomUUID(), question: question.value, blocking: true, disposition: "answered", answer: "Fictional answer.",
      })),
    },
  } }));
  await json(await page.request.post(`${jobApi}/confirm`, { data: {
    contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: review.revision,
  } }));
  const { scope } = await json<{ scope: { description: string }[] }>(await page.request.get(`${jobApi}/quotes`));
  await json(await page.request.post(`${jobApi}/quotes`, { data: {
    contractVersion: "quote_draft_command_v1", draftId: randomUUID(), expectedRevision: 0,
    currency: M1_QUOTE_POLICY.currency, taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion,
    lines: scope.map(line => ({
      ...line, id: randomUUID(), origin: "captured", included: true, exclusionReason: null, discountPercent: "0",
      taxTreatment: M1_QUOTE_POLICY.taxTreatment, rateProvenance: "entered", category: null, region: null,
    })),
  } }));
  return jobId;
}

async function savedQuote(page: Page, jobId: string) {
  return json<unknown>(await page.request.get(`/api/jobs/${jobId}/quotes`));
}

async function capture(page: Page, name: string, width: number) {
  const panel = page.getByTestId("v2-quote-prompts");
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await panel.screenshot({ path: resolve(shots, `${name}-${width}.png`), animations: "disabled",
    style: "nextjs-portal, .rr-mobile-nav { display: none !important; }" });
}

test("missing prompts show before sending, stay dismissed after reload and add nothing on their own", async ({ page, baseURL }) => {
  const checkRequests = trackRequests(page, baseURL!);
  const jobId = await quotingJob(page);
  const before = await savedQuote(page, jobId);
  await page.setViewportSize({ width: 360, height: 800 });
  await openQuote(page, jobId);
  const panel = page.getByTestId("v2-quote-prompts");
  await expect(panel.getByRole("heading", { name: "Don't forget" })).toBeVisible();
  const labels = ["Parking permit", "Making good", "Decorating after", "Protection and cleaning", "Overheads", "Contingency"];
  for (const label of labels) await expect(panel.getByText(label, { exact: true })).toBeVisible();
  // The skip line on the quote already covers waste removal.
  await expect(panel.getByText("Skip or waste removal", { exact: true })).toHaveCount(0);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "prompts", width);
  }

  await panel.getByRole("button", { name: "Not needed: Parking permit" }).click();
  await expect(panel.getByRole("status")).toHaveText("Parking permit dismissed. It stays dismissed on this device.");
  await page.reload();
  await page.getByRole("button", { name: "Price the work" }).click();
  await expect(panel.getByText("Making good", { exact: true })).toBeVisible();
  await expect(panel.getByText("Parking permit", { exact: true })).toHaveCount(0);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "dismissed", width);
  }

  // Sending is never blocked by a prompt: none of them appears among the reasons a quote cannot be issued.
  const blockers = page.locator(".quote-blockers");
  for (const label of labels) await expect(blockers.getByText(label)).toHaveCount(0);

  // V2-C6: on the quote the prompts can add a line (still unpriced), and nothing is added until one is pressed.
  await expect(panel.getByRole("button", { name: "Add a line for Making good" })).toBeVisible();
  await expect(panel.getByText("Lines are added in Scope review, before the scope is confirmed.")).toHaveCount(0);
  expect(await savedQuote(page, jobId)).toEqual(before);
  checkRequests();
});

test("the seeded, already sent and accepted quote shows no prompts", async ({ page }) => {
  await page.goto("/jobs");
  await page.getByRole("article").filter({ hasText: "Occupied-home kitchen splashback and hall decorating" })
    .getByRole("button", { name: "Open job →" }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}/u);
  const jobId = /\/jobs\/([0-9a-f-]{36})/u.exec(page.url())![1];
  await page.goto(`/jobs/${jobId}/work#quote`);
  const price = page.getByRole("button", { name: "Price the work" });
  if (await price.isVisible({ timeout: 20_000 }).catch(() => false)) await price.click();
  await expect(page.getByText("Won · accepted terms")).toBeVisible();
  await expect(page.getByTestId("v2-quote-prompts")).toHaveCount(0);
});

test("in Scope review, Add a line uses the existing omitted-line action, unpriced and unsaved", async ({ page, baseURL }) => {
  const checkRequests = trackRequests(page, baseURL!);
  const { jobId } = await captured(page, "v2-c5-scope");
  const proposalPath = `/api/jobs/${jobId}/proposal`;
  // A read with no saved review offers a fresh review id each time, so compare without it.
  const saved = async () => { const { reviewId: _fresh, ...rest } = await json<{ reviewId: string }>(await page.request.get(proposalPath)); return rest; };
  const before = await saved();
  expect(before).toMatchObject({ review: null });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/jobs/${jobId}/work`);
  const panel = page.getByTestId("v2-quote-prompts");
  await expect(panel.getByText("Parking permit", { exact: true })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "scope-review", width);
  }
  await panel.getByRole("button", { name: "Add a line for Parking permit" }).click();
  await expect(panel.getByRole("status")).toContainText("Parking permit line added without a price.");
  await expect(panel.getByText("Parking permit", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Unit Parking permit")).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "scope-review-added", width);
  }
  // Nothing is saved until the builder confirms the scope through the existing route.
  expect(await saved()).toEqual(before);
  checkRequests();
});
