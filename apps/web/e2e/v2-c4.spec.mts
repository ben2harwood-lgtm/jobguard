import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { M1_QUOTE_POLICY } from "@jobguard/core";
import { DEMO_TENANT_ID as tenantId, type WorkPlan } from "@jobguard/db";
import { expect, test, type APIResponse, type BrowserContext, type Page } from "@playwright/test";

test.skip(!process.env.V2_TEST_ORIGIN, "Requires the embedded V2 HTTPS launcher.");

const widths = [360, 1280] as const;
const taskTitle = "Protect and prepare the hall";
const shots = fileURLToPath(new URL("./artifacts/v2-c4", import.meta.url));

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
  // Capture the job chrome and the Plan. Keep the existing workspace below the Plan out of the comparison.
  await page.screenshot({
    path: resolve(shots, `${reference ? "mock" : "plan"}-${name}-${width}.png`),
    fullPage: true,
    animations: "disabled",
    style: "nextjs-portal, .rr-mobile-nav, #work-plan ~ * { display: none !important; }",
  });
}

const planCard = (page: Page) => page.locator("#work-plan");
const planPath = (jobId: string) => `/api/v2-backend/jobs/${jobId}/work-plan`;
const editTask = (page: Page) => planCard(page).getByRole("button", { name: `Edit task ${taskTitle}` });

test("seeded plan edits persist at both widths and existing Switch live works over HTTPS", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const checkRequests = trackRequests(page, baseURL!);
  expect(await json(await page.request.get("/api/v2-backend/healthz"))).toEqual({ status: "ok" });
  const jobs = await json<{ jobs: { id: string; title: string }[] }>(
    await page.request.get(`/api/jobs?tenantId=${tenantId}`));
  const job = jobs.jobs.find(row => row.title === "Occupied-home kitchen splashback and hall decorating");
  expect(job).toBeDefined();
  const work = `/jobs/${job!.id}/work`;
  const path = planPath(job!.id);
  const quotePath = `/api/jobs/${job!.id}/quotes`;
  const card = planCard(page);
  await page.goto(work);
  await expect(card.getByText("Accepted plan", { exact: true })).toBeVisible();
  await expect(card.getByRole("article")).toHaveCount(4);

  for (const [index, width] of widths.entries()) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "accepted", width);
    await editTask(page).click();
    await capture(page, "edit", width);
    const trade = index === 0 ? "Painter" : "Decorator";
    const duration = String(75 + index);
    const day = index === 0 ? "2026-11-30" : "2026-12-01";
    const shownDay = index === 0 ? "30 Nov" : "1 Dec";
    const assignee = index === 0 ? "Fictional Dot Dabs" : "Fictional Pat Paint";
    await card.getByLabel("Trade", { exact: true }).fill(trade);
    await card.getByLabel("Position").selectOption(String(index + 1));
    await card.getByLabel("Duration (minutes)").fill(duration);
    await card.getByLabel("Day", { exact: true }).fill(day);
    await card.getByLabel("Assignee").fill(assignee);
    const response = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
    await card.getByRole("button", { name: "Save task" }).click();
    const saved = await response;
    expect(saved.ok()).toBe(true);
    expect(saved.request().postDataJSON()).toMatchObject({ version: "work-plan-edit.v1", commandId: expect.any(String),
      changes: { trade, position: index + 1, durationMinutes: Number(duration), scheduledDate: day, assignee } });
    await expect(card.getByText("Task saved.")).toBeVisible();
    await page.reload();
    const row = card.getByRole("article").nth(index);
    await expect(row.getByRole("heading")).toHaveText(`${index + 1}. ${taskTitle}`);
    await expect(row).toContainText(`${trade} · ${duration} min · ${shownDay} · ${assignee}`);
    await expect(row.getByText("Scheduled", { exact: true })).toBeVisible();
  }

  // Commit an edit in a second request while the browser holds an earlier plan version.
  await editTask(page).click();
  const seen = await json<WorkPlan>(await page.request.get(path));
  const firstTask = seen.tasks[0]!;
  const concurrentEdit = { version: "work-plan-edit.v1", commandId: randomUUID(), quoteRevisionId: seen.quoteRevisionId,
    expectedVersion: seen.version, scopeItemId: firstTask.scopeItemId, taskKey: firstTask.key, changes: { durationMinutes: 83 } };
  const receipt = await json(await page.request.post(path, { data: concurrentEdit }));
  expect(await json(await page.request.post(path, { data: concurrentEdit }))).toEqual(receipt);
  await card.getByLabel("Trade", { exact: true }).fill("Unsaved trade");
  const refused = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
  await card.getByRole("button", { name: "Save task" }).click();
  expect((await refused).status()).toBe(409);
  await expect(card.getByRole("alert")).toContainText("The plan changed since you opened it. This edit was not saved.");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "stale", width);
  }
  await card.getByRole("button", { name: "Reload plan" }).click();
  await expect(card.getByText(/83 min/)).toBeVisible();
  await expect(card.getByText("Unsaved trade")).toHaveCount(0);

  const { activeAcceptance } = await json<{ activeAcceptance: {
    documentId: string; documentHash: string; documentVersion: number; statedCustomerName: string;
  } }>(await page.request.get(`${quotePath}/acceptance`));
  const { documentId, documentHash, documentVersion, statedCustomerName } = activeAcceptance;
  const target = { documentId, documentHash, documentVersion };
  await json(await page.request.post(`${quotePath}/acceptance/disposition`, { data: {
    ...target, version: "quote-disposition-command.v1", commandId: randomUUID(), kind: "acceptance_cancelled",
    occurredAt: new Date().toISOString(),
  } }));
  await page.reload();
  await expect(card.getByText("Acceptance cancelled")).toBeVisible();
  await expect(card.getByRole("button", { name: "Switch live" })).toHaveCount(0);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "cancelled", width);
  }
  await json(await page.request.post(`${quotePath}/acceptance`, { data: {
    ...target, version: "quote-acceptance-command.v1", commandId: randomUUID(), statedCustomerName,
    statedMethod: "verbal", acceptedAt: new Date().toISOString(),
  } }));
  await page.reload();
  await page.setViewportSize({ width: 360, height: 800 });
  const activation = page.waitForResponse(r => r.url().endsWith(`/api/v2-backend/jobs/${job!.id}/quotes/activation`) &&
    r.request().method() === "POST");
  await card.getByRole("button", { name: "Switch live" }).click();
  const reply = await activation;
  expect(reply.ok(), await reply.text()).toBe(true);
  expect(reply.request().postDataJSON()).toMatchObject({ version: "practice-activation-command.v1", scenario: "no_charge" });
  expect((await reply.json()).activation.acceptedDocumentId).toBe(documentId);
  await expect(card.getByText("Live plan")).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.reload();
    await expect(card.getByText("Live plan")).toBeVisible();
    await expect(card.getByText(/Decorator · 76 min · 1 Dec · Fictional Pat Paint/u)).toBeVisible();
    await capture(page, "live", width);
  }
  checkRequests();
});

// C3B-1 (Q47): an approved extra's task is planned from the screen. Runs on the seeded job after the test above.
test("an approved extra can be planned from the screen and a later approval makes the open edit stale", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const checkRequests = trackRequests(page, baseURL!);
  const jobs = await json<{ jobs: { id: string; title: string }[] }>(
    await page.request.get(`/api/jobs?tenantId=${tenantId}`));
  const job = jobs.jobs.find(row => row.title === "Occupied-home kitchen splashback and hall decorating");
  expect(job).toBeDefined();
  const path = planPath(job!.id);
  const card = planCard(page);
  if ((await json<{ state: string }>(await page.request.get(path))).state !== "live") {
    await json(await page.request.post(`/api/v2-backend/jobs/${job!.id}/quotes/activation`, { data: {
      version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" } }));
  }
  type Variations = { variations: { id: string; currentRevisionId: string | null }[] };
  const vary = async (fields: Record<string, unknown>) => json<Variations>(await page.request.post(
    `/api/jobs/${job!.id}/variations`, { data: { version: "variation-command.v1", ...fields } }));
  const attestation = "Builder-recorded practice acceptance — not an authenticated customer signature";
  const approved = async (description: string, unitRatePence: number, direction: "addition" | "omission") => {
    const proposalId = randomUUID();
    const proposed = await vary({ action: "propose", proposalId, scopeItemId: randomUUID(), existingScopeItemId: null,
      lineageParentScopeItemId: null, description, captureText: description,
      price: { quantity: "1", unit: "item", unitRatePence, direction } });
    const revisionId = proposed.variations.find(row => row.id === proposalId)!.currentRevisionId!;
    await vary({ action: "approve", variationId: proposalId, revisionId, approvalId: randomUUID(), attestation });
    return { proposalId, revisionId };
  };
  const trim = await approved("Add trim", 12500, "addition");
  await approved("Leave out the hall shelf", 4000, "omission");

  await page.goto(`/jobs/${job!.id}/work`);
  await expect(card.getByRole("heading", { name: "Approved extras not on the plan" })).toBeVisible();
  await expect(card.getByText("Leave out the hall shelf: removed work, nothing to plan")).toBeVisible();
  const plans = [
    { width: 360, button: "Plan task Add trim", trade: "Joiner", day: "2026-12-02", shown: "2 Dec" },
    { width: 1280, button: "Edit task Add trim", trade: "Carpenter", day: "2026-12-03", shown: "3 Dec" },
  ];
  for (const { width, button, trade, day, shown } of plans) {
    await page.setViewportSize({ width, height: 800 });
    await card.getByRole("button", { name: button }).click();
    await card.getByLabel("Trade", { exact: true }).fill(trade);
    await card.getByLabel("Duration (minutes)").fill("45");
    await card.getByLabel("Day", { exact: true }).fill(day);
    const response = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
    await card.getByRole("button", { name: "Save task" }).click();
    const saved = await response;
    expect(saved.ok(), await saved.text()).toBe(true);
    expect(saved.request().postDataJSON()).toMatchObject({ version: "work-plan-edit.v1", taskKey: "custom-scope-item",
      variationRevisionId: trim.revisionId, changes: { trade, durationMinutes: 45, scheduledDate: day } });
    await expect(card.getByText("Task saved.")).toBeVisible();
    await page.reload();
    const row = card.getByRole("article").filter({ has: page.getByRole("heading", { name: /Add trim$/u }) });
    await expect(row).toContainText(`${trade} · 45 min · ${shown}`);
    await expect(card.getByRole("heading", { name: "Unplanned" })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await card.screenshot({ path: resolve(shots, `../v2-c3b1/extra-planned-${width}.png`), animations: "disabled",
      style: "nextjs-portal, .rr-mobile-nav { display: none !important; }" });
  }

  // The screen holds the first approved revision while a second one is approved elsewhere.
  await card.getByRole("button", { name: "Edit task Add trim" }).click();
  const nextRevision = randomUUID();
  await vary({ action: "revise", variationId: trim.proposalId, expectedRevisionId: trim.revisionId, revisionId: nextRevision,
    description: "Add oak trim", price: { quantity: "1", unit: "item", unitRatePence: 15000, direction: "addition" } });
  await vary({ action: "approve", variationId: trim.proposalId, revisionId: nextRevision, approvalId: randomUUID(), attestation });
  await card.getByLabel("Trade", { exact: true }).fill("Unsaved trade");
  const refused = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
  await card.getByRole("button", { name: "Save task" }).click();
  const stale = await refused;
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toEqual({ code: "WORK_PLAN_VERSION_CONFLICT" });
  await expect(card.getByRole("alert")).toContainText("The plan changed since you opened it. This edit was not saved.");
  await card.getByRole("button", { name: "Reload plan" }).click();
  const revised = card.getByRole("article").filter({ has: page.getByRole("heading", { name: /Add oak trim$/u }) });
  await expect(revised).toContainText("Carpenter · 45 min · 3 Dec");
  await expect(revised.getByText("Review previous edits")).toBeVisible();
  await expect(card.getByText("Unsaved trade")).toHaveCount(0);
  checkRequests();
});

// C3B-2 (Q48): a no-charge extra is marked "Adds work", then planned. Runs on the seeded job after the tests above.
test("a no-charge extra marked Adds work can be planned and the plan keeps it after reload", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const checkRequests = trackRequests(page, baseURL!);
  const jobs = await json<{ jobs: { id: string; title: string }[] }>(
    await page.request.get(`/api/jobs?tenantId=${tenantId}`));
  const job = jobs.jobs.find(row => row.title === "Occupied-home kitchen splashback and hall decorating");
  expect(job).toBeDefined();
  const path = planPath(job!.id);
  const card = planCard(page);
  if ((await json<{ state: string }>(await page.request.get(path))).state !== "live") {
    await json(await page.request.post(`/api/v2-backend/jobs/${job!.id}/quotes/activation`, { data: {
      version: "practice-activation-command.v1", commandId: randomUUID(), scenario: "no_charge" } }));
  }
  const vary = async (fields: Record<string, unknown>) => json<{ variations: { id: string; currentRevisionId: string }[] }>(
    await page.request.post(`/api/jobs/${job!.id}/variations`, { data: { version: "variation-command.v1", ...fields } }));
  const proposalId = randomUUID();
  const proposed = await vary({ action: "propose", proposalId, scopeItemId: randomUUID(), existingScopeItemId: null,
    lineageParentScopeItemId: null, description: "Move the socket", captureText: "Move the socket, no charge",
    price: { quantity: "1", unit: "item", unitRatePence: 0, direction: "addition" } });
  const revisionId = proposed.variations.find(row => row.id === proposalId)!.currentRevisionId;
  await vary({ action: "approve", variationId: proposalId, revisionId, approvalId: randomUUID(),
    attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });

  await page.goto(`/jobs/${job!.id}/work`);
  await expect(card.getByText("Move the socket: no price change: say whether it adds or removes work")).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await card.screenshot({ path: resolve(shots, `../v2-c3b2/direction-ask-${width}.png`), animations: "disabled",
      style: "nextjs-portal, .rr-mobile-nav { display: none !important; }" });
  }
  await page.setViewportSize({ width: 360, height: 800 });
  const answered = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
  await card.getByRole("button", { name: "Adds work: Move the socket" }).click();
  const answer = await answered;
  expect(answer.ok(), await answer.text()).toBe(true);
  expect(answer.request().postDataJSON()).toMatchObject({ version: "work-plan-extra-direction.v1", variationRevisionId: revisionId,
    direction: "adds_work", commandId: expect.any(String) });
  await expect(card.getByText("Extra added to Unplanned.")).toBeVisible();
  await card.getByRole("button", { name: "Plan task Move the socket" }).click();
  await card.getByLabel("Trade", { exact: true }).fill("Electrician");
  await card.getByLabel("Duration (minutes)").fill("30");
  const saved = page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === "POST");
  await card.getByRole("button", { name: "Save task" }).click();
  expect((await saved).request().postDataJSON()).toMatchObject({ variationRevisionId: revisionId });
  await expect(card.getByText("Task saved.")).toBeVisible();
  await page.reload();
  const row = card.getByRole("article").filter({ has: page.getByRole("heading", { name: /Move the socket$/u }) });
  await expect(row).toContainText("Electrician · 30 min");
  await expect(card.getByText(/Move the socket: no price change/u)).toHaveCount(0);
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await card.screenshot({ path: resolve(shots, `../v2-c3b2/direction-planned-${width}.png`), animations: "disabled",
      style: "nextjs-portal, .rr-mobile-nav { display: none !important; }" });
  }
  checkRequests();
});

test("empty, changed draft and problem states match the checked mock-up at both widths", async ({ page, baseURL }) => {
  const checkRequests = trackRequests(page, baseURL!);
  const { jobId, proposalId, reviewId, proposal } = await json<{
    jobId: string; proposalId: string; reviewId: string; proposal: {
      lines: { id: string; scopeItemId: string; description: { value: string }; quantity: { value: string };
        unit: { value: string }; unitPricePence: { value: number }; sourceExcerpt: string }[];
      questions: { question: { value: string } }[];
    };
  }>(await page.request.post("/api/jobs/capture", { data: {
    contractVersion: "job_capture_v1", requested_tenant_id: tenantId, captureId: randomUUID(),
    fixtureId: "v2-c4-browser",
    source: { kind: "text", text: "JOB: Fictional kitchen planning\nITEM: Tile the splashback | QTY: 6 | UNIT: m2 | RATE: £95.00\nITEM: Refit splashback trim | QTY: 1 | UNIT: item | RATE: £30.00" },
  } }));
  const work = `/jobs/${jobId}/work`;
  const jobApi = `/api/jobs/${jobId}`;
  const card = planCard(page);
  await page.goto(work);
  await expect(card.getByRole("heading", { name: "No planned tasks yet" })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "empty", width);
  }

  const { review } = await json<{ review: { revision: number } }>(await page.request.post(`${jobApi}/review`, { data: {
    contractVersion: "proposal_review_command_v1", expectedRevision: 0,
    review: {
      version: "proposal_review_v1", jobId, proposalId, reviewId, revision: 0,
      lines: proposal.lines.map((line, index) => ({
        id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
        room: "Kitchen", category: index === 0 ? "Tiling" : "Joinery", quantity: line.quantity.value, unit: line.unit.value,
        unitPricePence: line.unitPricePence.value, disposition: "accepted", dismissalReason: null,
        parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt,
      })),
      questions: proposal.questions.map(({ question }) => ({
        id: randomUUID(), question: question.value, blocking: true, disposition: "answered", answer: "Builder will clear the kitchen.",
      })),
    },
  } }));
  await json(await page.request.post(`${jobApi}/confirm`, { data: {
    contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: review.revision,
  } }));
  const { scope } = await json<{ scope: { description: string }[] }>(await page.request.get(`${jobApi}/quotes`));
  const lines = scope.map(line => ({
    ...line, id: randomUUID(), origin: "captured", included: true, exclusionReason: null, discountPercent: "0",
    taxTreatment: M1_QUOTE_POLICY.taxTreatment, rateProvenance: "entered",
    category: line.description === "Tile the splashback" ? "Tiling" : "Joinery", region: null,
  }));
  const draftId = randomUUID();
  const saveQuote = (expectedRevision: number, newLines: typeof lines) => page.request.post(`${jobApi}/quotes`, { data: {
    contractVersion: "quote_draft_command_v1", draftId, expectedRevision, lines: newLines,
    currency: M1_QUOTE_POLICY.currency, taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion,
  } }).then(json);
  await saveQuote(0, lines);
  await page.reload();
  await expect(card.getByText("Draft plan")).toBeVisible();
  await expect(card.getByRole("heading", { name: "Unplanned" })).toBeVisible();
  await saveQuote(1, lines.map(line => line.category === "Tiling" ? { ...line, description: "Tile to the end of the worktop" } : line));
  await page.reload();
  await expect(card.getByText("Changed since last quote revision")).toHaveCount(2);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "draft", width);
  }
  await card.getByRole("button", { name: "Plan task Refit splashback trim" }).click();
  await card.getByLabel("Trade", { exact: true }).fill("Joiner");
  await card.getByLabel("Duration (minutes)").fill("45");
  await card.getByRole("button", { name: "Save task" }).click();
  await expect(card.getByText("Task saved.")).toBeVisible();
  await page.reload();
  await expect(card.getByRole("article").last()).toContainText("Refit splashback trim");
  await expect(card.getByRole("heading", { name: "Unplanned" })).toHaveCount(0);

  // Inject a read outage only. All draft writes above used real PostgreSQL.
  const path = planPath(jobId);
  await page.route(path, route => route.fulfill({ status: 503, json: { code: "WORK_PLAN_UNAVAILABLE" } }));
  await page.reload();
  await expect(card.getByRole("alert")).toContainText("The plan could not open. Your job is unchanged.");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, "problem", width);
  }
  await page.unroute(path);
  await card.getByRole("button", { name: "Reload plan" }).click();
  await expect(card.getByText("Draft plan")).toBeVisible();

  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/v2-mock");
    await expect(page.getByText("Accepted plan", { exact: true })).toBeVisible();
    await capture(page, "accepted", width, true);
    await page.getByRole("button", { name: "Edit task Prepare and tile the splashback" }).click();
    await capture(page, "edit", width, true);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const status = page.getByLabel("Preview plan status");
    await status.selectOption("Draft");
    await capture(page, "draft", width, true);
    await status.selectOption("Accepted");
    await page.getByRole("button", { name: "Switch live" }).click();
    await capture(page, "live", width, true);
    const preview = page.getByLabel("Preview state");
    await preview.selectOption("Empty");
    await capture(page, "empty", width, true);
    await preview.selectOption("Problem");
    await capture(page, "problem", width, true);
  }
  checkRequests();
});
