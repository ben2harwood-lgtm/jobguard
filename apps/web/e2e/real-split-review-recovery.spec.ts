import { expect, test, type Page } from "@playwright/test";

test.setTimeout(180_000);
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
});
const painting = "Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.";
const bathroom = "Bathroom refit for Mrs Sample at 4 Madeup Lane. Rip out the old suite and take it away, fit a new bath, basin and toilet, tile the walls and floor, new extractor fan. About 4800 pounds all in, should take two weeks.";
// Distinct from the natural-items parser's own first line, so part A never shares the split parent's label.
const hall = "Paint hall, stairs and landing in two coats";
const woodwork = "Paint woodwork in gloss";
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
const cards = (page: Page) => page.locator(".review-line");
const answerBoxes = (page: Page) => page.locator('input[aria-label^="Answer "]');
async function capture(page: Page, source: string) {
  await page.goto("/practice-company");
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click(page, "＋ Start a new job");
  await page.getByLabel("Work details").fill(source);
  await click(page, "Make my draft");
  await click(page, "Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
async function answers(page: Page) {
  for (const box of await answerBoxes(page).all()) await box.fill("Fictional builder has checked this question and included the work described.");
}
async function acceptRemaining(page: Page) {
  for (const card of await cards(page).all()) {
    if (await card.locator("strong").textContent() !== "proposed") continue;
    // Explicitly review other extracted items if the wider parser has landed.
    const description = await card.locator('input[aria-label^="Description "]').inputValue();
    expect(description.trim()).not.toBe("");
    await card.getByRole("button", { name: `Accept ${description}`, exact: true }).click();
  }
}
// Scope to the review card: Next's route announcer is also role="alert".
const reviewAlert = (page: Page) => page.locator("section.review").getByRole("alert");
async function saved(page: Page) {
  await click(page, "Save review");
  await expect(reviewAlert(page)).toContainText("Review saved.");
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function snapshot(page: Page, jobId: string) {
  const response = await page.request.get(`/api/jobs/${jobId}/proposal`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test("walk 2 Split reaches confirmed scope without guessing quantity", async ({ page }) => {
  const jobId = await capture(page, painting);
  const initialCount = await cards(page).count();
  const parent = cards(page).filter({ has: page.locator('input[aria-label^="Description Paint"]') }).first();
  const originalDescription = await parent.locator('input[aria-label^="Description "]').inputValue();
  await parent.getByRole("button", { name: `Split ${originalDescription}`, exact: true }).click();
  const childA = page.getByLabel(`Description ${originalDescription} — part A`, { exact: true });
  await expect(childA).toBeFocused();
  await expect(childA).toBeInViewport();
  await expect(page.getByTestId("proposal-line-count")).toHaveText(String(initialCount + 2));
  await expect(cards(page).nth(0).locator("strong")).toHaveText("split");
  await expect(cards(page).nth(1)).toContainText("check both descriptions and accept each child");
  await childA.fill(hall);
  await page.getByLabel(`Description ${originalDescription} — part B`, { exact: true }).fill(woodwork);
  for (const description of [hall, woodwork]) {
    const child = cards(page).filter({ has: page.getByLabel(`Description ${description}`, { exact: true }) });
    await expect(child.locator("strong")).toHaveText("proposed");
    await expect(child).toContainText("Price needed");
    await expect(page.getByLabel(`Quantity ${description}`, { exact: true })).toHaveValue("1");
    await expect(page.getByLabel(`Unit ${description}`, { exact: true })).toHaveValue("item");
  }
  await answers(page);
  await click(page, "Confirm scope");
  await expect(reviewAlert(page)).toContainText(`Choose Accept, Split, Merge or Dismiss for ‘${hall}’`);
  await expect(reviewAlert(page)).toContainText(woodwork);
  await expect(page.getByLabel(`Description ${hall}`, { exact: true })).toBeFocused();
  await noOverflow(page);
  await acceptRemaining(page);
  await click(page, "Confirm scope");
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  const persisted = await snapshot(page, jobId);
  const parentLine = persisted.review.lines.find((line: { description: string }) => line.description === originalDescription);
  const children = persisted.review.lines.filter((line: { description: string }) => [hall, woodwork].includes(line.description));
  expect(parentLine.disposition).toBe("split");
  expect(children).toHaveLength(2);
  for (const child of children) expect(child).toMatchObject({ origin: "human", disposition: "accepted", quantity: "1", unit: "item", unitPricePence: null, parentScopeItemIds: [parentLine.scopeItemId], sourceExcerpt: null });
  expect(new Set([parentLine.scopeItemId, ...children.map((line: { scopeItemId: string }) => line.scopeItemId)]).size).toBe(3);
});

for (const field of ["Quantity", "Unit"]) {
  test(`Split names a cleared child ${field} before REVIEW_INCOMPLETE`, async ({ page }) => {
    const jobId = await capture(page, painting);
    const parent = cards(page).first();
    const original = await parent.locator('input[aria-label^="Description "]').inputValue();
    await click(page, `Split ${original}`);
    await page.getByLabel(`Description ${original} — part A`, { exact: true }).fill(hall);
    await page.getByLabel(`Description ${original} — part B`, { exact: true }).fill(woodwork);
    await acceptRemaining(page);
    await answers(page);
    const input = page.getByLabel(`${field} ${hall}`, { exact: true });
    await input.fill("");
    await click(page, "Confirm scope");
    await expect(reviewAlert(page)).toHaveText(new RegExp(`Scope is not confirmed\\. Add ${field} for ‘${hall}’.*REVIEW_INCOMPLETE`, "u"));
    await expect(input).toBeFocused();
    expect((await snapshot(page, jobId)).status).toBe("draft");
    await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toHaveCount(0);
    await noOverflow(page);
    await page.reload();
    await expect(page.getByLabel(`${field} ${hall}`, { exact: true })).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  });
}

test("walk 2 unanswered questions explain why scope remains draft", async ({ page }) => {
  const jobId = await capture(page, bathroom);
  await acceptRemaining(page);
  const questions = await page.locator(".questions > div > p").allTextContents();
  expect(questions.length).toBeGreaterThan(0);
  // Whitespace is unanswered too, even though an input event occurred.
  await answerBoxes(page).first().fill("   ");
  await click(page, "Confirm scope");
  await expect(reviewAlert(page)).toContainText("Scope is not confirmed. Answer:");
  for (const question of questions) await expect(reviewAlert(page)).toContainText(`“${question}”`);
  await expect(page.getByLabel(`Answer ${questions[0]}`, { exact: true })).toBeFocused();
  await noOverflow(page);
  expect((await snapshot(page, jobId)).status).toBe("draft");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Check the work items" })).toBeVisible();
  for (const badge of await cards(page).locator("strong").all()) await expect(badge).toHaveText("accepted");
  await answers(page);
  await saved(page);
  const description = cards(page).first().locator('input[aria-label^="Description "]');
  await description.fill("Bathroom work checked after saving");
  // Advance the actual server revision like another tab. No mocked success responses.
  const remote = await snapshot(page, jobId);
  const advanced = await page.request.post(`/api/jobs/${jobId}/review`, { data: { contractVersion: "proposal_review_command_v1", expectedRevision: remote.review.revision, review: remote.review } });
  expect(advanced.ok()).toBe(true);
  await click(page, "Confirm scope");
  await expect(reviewAlert(page)).toHaveText("This draft changed. Review the latest version.");
  await expect(description).toHaveValue("Bathroom work checked after saving");
  expect((await snapshot(page, jobId)).status).toBe("draft");
  await page.reload();
  await saved(page);
  await cards(page).first().locator('input[aria-label^="Description "]').fill("Bathroom work checked after saving");
  await click(page, "Confirm scope");
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  expect((await snapshot(page, jobId)).review.lines[0].description).toBe("Bathroom work checked after saving");
});

test("unsupported one-line capture retains repeated Split history and live add/merge count", async ({ page }) => {
  const jobId = await capture(page, "Please inspect this fictional room");
  await expect(cards(page)).toHaveCount(1);
  const original = await cards(page).first().locator('input[aria-label^="Description "]').inputValue();
  await click(page, `Split ${original}`);
  await page.getByLabel(`Description ${original} — part A`, { exact: true }).fill("Inspect fictional ceiling");
  await click(page, "Split Inspect fictional ceiling");
  await expect(cards(page)).toHaveCount(5);
  await expect(page.getByTestId("proposal-line-count")).toHaveText("5");
  await click(page, "Add omitted line");
  await expect(page.getByTestId("proposal-line-count")).toHaveText("6");
  await page.getByLabel("Select Inspect fictional ceiling — part A for merge", { exact: true }).check();
  await page.getByLabel("Select Omitted item for merge", { exact: true }).check();
  await click(page, "Merge selected (2)");
  await expect(page.getByTestId("proposal-line-count")).toHaveText("7");
  await expect(cards(page)).toHaveCount(7);
  await answers(page);
  await acceptRemaining(page);
  await saved(page);
  const before = await snapshot(page, jobId);
  const lines = before.review.lines;
  expect(new Set(lines.map((line: { scopeItemId: string }) => line.scopeItemId)).size).toBe(7);
  expect(lines.filter((line: { disposition: string }) => line.disposition === "split")).toHaveLength(2);
  expect(lines.filter((line: { disposition: string }) => line.disposition === "merged")).toHaveLength(2);
  for (const child of lines.filter((line: { origin: string; parentScopeItemIds: string[] }) => line.origin === "human" && line.parentScopeItemIds.length)) expect(child.unitPricePence).toBeNull();
  await page.reload();
  await expect(page.getByTestId("proposal-line-count")).toHaveText("7");
  await click(page, "Confirm scope");
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("3");
});
