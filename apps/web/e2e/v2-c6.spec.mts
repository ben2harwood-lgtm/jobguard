import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { M1_QUOTE_POLICY } from "@jobguard/core";
import { DEMO_TENANT_ID as tenantId } from "@jobguard/db";
import { expect, test, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

test.skip(!process.env.V2_TEST_ORIGIN, "Requires the running V2 launcher.");

const widths = [360, 1280] as const;
const shots = fileURLToPath(new URL("./artifacts/v2-c6", import.meta.url));

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
  const { jobId, proposalId, reviewId, proposal } = await captured(page, "v2-c6-browser");
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
  // Customer and site, so the quote can be previewed.
  const { jobRevision } = await json<{ jobRevision: number }>(await page.request.get(`${jobApi}/parties`));
  await json(await page.request.post(`${jobApi}/parties`, { data: {
    version: "job-parties-command.v1", action: "save_form", commandId: randomUUID(), expectedJobRevision: jobRevision,
    expectedBindingId: null, customerRef: null,
    customer: { version: "customer.v1", type: "person", name: "Fictional C6 Customer", email: "customer@jobguard-v2.invalid", phone: "+447700900043" },
    site: { version: "site.v1", addressLines: ["6 Pretend Parade"], town: "Sampleford", postcode: "ZY1 0AA" },
    savedSiteRevisionId: null, reuseSiteId: null, expectedReuseRevisionId: null, confirmSamePlace: false,
    payingPartyRevisionId: null, expectedPayerRevisionId: null, correct: false,
  } }));
  return jobId;
}

async function savedQuote(page: Page, jobId: string) {
  return json<{ scope: { scopeItemId: string; description: string }[]; revisions: { revision: number; netPence: number }[] }>(
    await page.request.get(`/api/jobs/${jobId}/quotes`));
}

async function shot(page: Page, name: string, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const box = page.getByTestId("v2-quote-add-line");
  await box.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(shots, `${name}-${width}.png`), animations: "disabled", fullPage: false,
    style: "nextjs-portal, .rr-mobile-nav { display: none !important; }" });
}

async function tall(page: Page, name: string) {
  for (const control of [page.getByRole("button", { name }).first()]) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
  }
}

for (const width of widths) {
  test(`V2-C6 at ${width}: add a line from a prompt and by typing, price one, exclude one, save and preview`, async ({ page, baseURL }) => {
    const checkRequests = trackRequests(page, baseURL!);
    const jobId = await quotingJob(page);
    const before = await savedQuote(page, jobId);
    await page.setViewportSize({ width, height: 900 });
    await openQuote(page, jobId);
    const net = page.getByTestId("quote-net");
    await expect(net).toHaveText("GBP 1,450.00");
    const preview = page.getByRole("button", { name: "Preview this quote" });
    // A preview made before the add goes out of date by the editor's signature rule.
    await preview.click();
    await expect(page.getByRole("region", { name: "Quote preview" })).toBeVisible();

    const panel = page.getByTestId("v2-quote-prompts");
    await expect(panel.getByText("Jobs like this usually carry these costs. Add a line here, without a price, or say it isn't needed.")).toBeVisible();
    await tall(page, "Add a line for Parking permit");
    await panel.getByRole("button", { name: "Add a line for Parking permit" }).click();
    await expect(panel.getByRole("status")).toHaveText(
      "Parking permit added without a price. Price it or exclude it with a reason, then save a draft revision.");
    await expect(page.getByLabel("Unit rate Parking permit")).toHaveValue("");
    await expect(page.locator(".quote-line").filter({ hasText: "Parking permit" })).toContainText("Added by you · Price: not confirmed yet");
    await expect(preview).toBeDisabled();
    await page.getByRole("button", { name: "Simulate sending this quote" }).click();
    await expect(page.getByRole("status").filter({ hasText: "The quote changed. Preview and approve it again." })).toBeVisible();

    const box = page.getByTestId("v2-quote-add-line");
    await box.getByLabel("Describe the line to add").pressSequentially("Move the fridge freezer");
    await tall(page, "Add this line");
    await box.getByRole("button", { name: "Add this line" }).click();
    await expect(box.getByRole("status")).toHaveText(
      "Move the fridge freezer added without a price. Price it or exclude it with a reason, then save a draft revision.");
    await shot(page, "added", width);

    // Nothing reaches the quote until the builder saves; the scope already holds both items.
    const added = await savedQuote(page, jobId);
    expect(added.revisions).toEqual(before.revisions);
    expect(added.scope.map(item => item.description)).toEqual([...before.scope.map(item => item.description),
      "Parking permit", "Move the fridge freezer"]);

    await page.getByLabel("Unit rate Parking permit").pressSequentially("45.00");
    const fridge = page.locator(".quote-line").filter({ hasText: "Move the fridge freezer" });
    await fridge.getByRole("checkbox").uncheck();
    await page.getByLabel("Exclusion reason Move the fridge freezer").fill("Customer will move it");
    await expect(net).toHaveText("GBP 1,495.00");
    await page.getByRole("button", { name: "Save draft revision" }).click();
    await expect(page.getByTestId("quote-revision")).toHaveText("2");
    const saved = await savedQuote(page, jobId);
    expect(saved.revisions.at(-1)!.netPence - before.revisions.at(-1)!.netPence).toBe(4500);
    await expect(preview).toBeEnabled();
    await preview.click();
    await expect(page.getByRole("region", { name: "Quote preview" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Coverage diff" })).toContainText("Move the fridge freezer: Customer will move it");
    await shot(page, "priced", width);
    checkRequests();
  });
}
