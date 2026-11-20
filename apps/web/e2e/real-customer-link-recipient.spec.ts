import { expect, test, type Browser, type Page } from "@playwright/test";

const words = "New kitchen worktops for Mrs Sample at 4 Madeup Lane. Fit two oak worktops, about 1400 quid all in.";
const email = "mrs-sample@example.invalid";
const guidance = "Add a fictional customer email in Customer and site to get a practice link.";

test.setTimeout(180_000);

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const customerEmail = (page: Page) => page.getByLabel("Customer email (fictional, optional)", { exact: true });
const recipient = (page: Page) => page.getByLabel("Confirmed recipient", { exact: true });
const practiceLink = (page: Page) => button(page, "Get practice customer link");

async function expectNoSidewaysScroll(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function saveCustomer(page: Page) {
  const saved = page.waitForResponse(response =>
    response.url().endsWith("/parties") && response.request().method() === "POST");
  await button(page, "Save customer and site").click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByTestId("party-customer")).toHaveText("Mrs Sample");
  await expect(page.getByRole("form", { name: "Customer and site details" }).locator("fieldset")).toBeEnabled();
}

async function draftQuote(page: Page, enterEmail: boolean) {
  await page.goto("/practice-company");
  await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
  await button(page, "＋ Start a new job").click();
  await page.getByLabel("Work details").fill(words);
  await button(page, "Make my draft").click();
  await button(page, "Check and edit my draft").click();

  await expect(page.getByText("Suggested from your words — check before saving", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Mrs Sample");
  await expect(page.getByLabel("Premises address", { exact: true })).toHaveValue("4 Madeup Lane");
  await expect(customerEmail(page)).toHaveValue("");
  await page.getByLabel("Town", { exact: true }).fill("Exampleton");
  await page.getByLabel("UK postcode", { exact: true }).fill("SW1A 1AA");
  if (enterEmail) await customerEmail(page).fill(email);
  await expectNoSidewaysScroll(page);
  await saveCustomer(page);

  for (const quantity of await page.getByRole("textbox", { name: /^Quantity /u }).all()) {
    if (!(await quantity.inputValue())) await quantity.fill("1");
  }
  for (const unit of await page.getByRole("textbox", { name: /^Unit /u }).all()) {
    if (!(await unit.inputValue())) await unit.fill("item");
  }
  for (const answer of await page.getByRole("textbox", { name: /^Answer /u }).all()) {
    if (!(await answer.inputValue())) await answer.fill("Builder fits the fictional oak worktops and removes waste.");
  }
  const lines = page.locator(".review-line");
  await expect(lines.first()).toBeVisible();
  for (const line of await lines.all()) {
    await line.getByRole("button", { name: /^Accept /u }).click();
    await expect(line.locator(".review-line-head strong")).toHaveText("accepted");
  }
  await button(page, "Confirm scope").click();
  await button(page, "Price the work").click();
  const quote = page.locator(".quote-editor");
  await expect(quote).toHaveAttribute("data-quote-ready", "true");
  const rates = quote.getByRole("textbox", { name: /^Unit rate /u });
  await expect(rates.first()).toBeVisible();
  for (const [index, rate] of (await rates.all()).entries()) {
    if (!(await rate.inputValue())) await rate.fill(index === 0 ? "1400.00" : "0.00");
  }
  await button(page, "Save draft revision").click();
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await expectNoSidewaysScroll(page);
}

async function previewQuote(page: Page) {
  const previewed = page.waitForResponse(response =>
    response.url().endsWith("/quotes/preview") && response.request().method() === "POST");
  await button(page, "Preview this quote").click();
  expect((await previewed).ok()).toBe(true);
  await expect(practiceLink(page)).toBeVisible();
  await expectNoSidewaysScroll(page);
}

async function acceptInSeparateBrowser(page: Page, browser: Browser) {
  await practiceLink(page).click();
  const link = page.getByLabel("Practice customer link — nothing emailed or texted", { exact: true });
  await expect(link).toHaveValue(/.+/u);
  const customer = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    const separate = await customer.newPage();
    await separate.goto(await link.inputValue());
    await button(separate, "Sign in").click();
    await separate.getByRole("link", { name: "Review your quote", exact: true }).click();
    await expect(separate.getByText(`To Mrs Sample · ${email}`, { exact: true })).toBeVisible();
    await expectNoSidewaysScroll(separate);
    await button(separate, "Accept this quote").click();
    await expect(separate.getByText("You accepted this quote.", { exact: true })).toBeVisible();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByText("Customer accepted: authenticated customer", { exact: true })).toBeVisible();
  } finally {
    await customer.close();
  }
}

test("missing saved email gives guidance, then the added email works", async ({ page, browser }) => {
  await draftQuote(page, false);
  await previewQuote(page);
  await expect(practiceLink(page)).toBeDisabled();
  await expect(page.getByText(guidance, { exact: true })).toBeVisible();

  await customerEmail(page).fill(email);
  await saveCustomer(page);
  await expect(recipient(page)).toHaveValue(email);
  await previewQuote(page);
  await acceptInSeparateBrowser(page, browser);
});

test("the first saved customer email follows through to acceptance", async ({ page, browser }) => {
  await draftQuote(page, true);
  await expect(recipient(page)).toHaveValue(email);
  await previewQuote(page);
  await acceptInSeparateBrowser(page, browser);
});
