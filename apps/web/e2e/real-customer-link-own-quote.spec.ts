import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
 test(`own practice quote accepted in a separate customer browser (${viewport.width})`, async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(viewport);
  await page.goto("/practice-company?name=Fictional%20Alex");
  const click = async (name: string) => {
   const button = page.getByRole("button", { name, exact: true });
   await expect(button).toBeEnabled(); await button.click();
  };
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click("＋ Start a new job");
  await page.getByLabel("Work details").fill("JOB: Fictional blue room\nITEM: Paint walls | £200.00");
  await click("Make my draft"); await click("Check and edit my draft");
  await click("Save customer and site"); await click("Accept Paint walls");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await click("Confirm scope"); await click("Price the work");
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await click("Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  const previewResponse = page.waitForResponse(r => r.url().endsWith("/quotes/preview") && r.request().method() === "POST");
  await click("Preview immutable quote");
  const stored = (await (await previewResponse).json()).document;
  // Baseline regression: this control is absent before the implementation.
  await click("Get practice customer link");
  const link = await page.getByLabel("Practice customer link — nothing emailed or texted").inputValue();
  // Keep an unsaved edit in the builder while the customer reviews the stored quote.
  await page.getByLabel("Unit rate Paint walls", { exact: true }).fill("201.00");
  const customer = await browser.newContext({ viewport, baseURL: new URL(page.url()).origin });
  try {
   const separate = await customer.newPage();
   await separate.goto(link);
   await separate.getByRole("button", { name: "Sign in", exact: true }).click();
   await separate.getByRole("link", { name: "Review your quote", exact: true }).click();
   await expect(separate.getByText(`From ${stored.issuer.name} · ${stored.issuer.email}`, { exact: true })).toBeVisible();
   await expect(separate.getByText(`To ${stored.customer.name} · ${stored.customer.email}`, { exact: true })).toBeVisible();
   await expect(separate.getByRole("listitem").filter({ hasText: "Paint walls" })).toBeVisible();
   await expect(separate.getByText(/Net £200.00 · VAT £40.00 · Total £240.00/)).toBeVisible();
   const builderRoute = await separate.request.get(`/api/jobs/${await page.locator(".quote-editor").getAttribute("data-job-id")}/quotes`);
   expect(builderRoute.ok()).toBe(false);
   await separate.getByRole("button", { name: "Accept this quote", exact: true }).click();
   await expect(separate.getByText("You accepted this quote.", { exact: true })).toBeVisible();
   await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
   await expect(page.getByText("Customer accepted: authenticated customer", { exact: true })).toBeVisible();
   await expect(page.getByTestId("customer-acceptance-time")).toBeVisible();
   await expect(page.getByLabel("Unit rate Paint walls", { exact: true })).toHaveValue("201.00");
   await click("Start this practice job");
   await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  } finally { await customer.close(); }
 });
}
