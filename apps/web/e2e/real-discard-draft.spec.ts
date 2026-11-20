import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`discard a mistaken draft and keep a quoting job (${viewport.width})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await page.goto("/practice-company?name=Fictional%20Alex");
    const click = async (name: string) => {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeEnabled();
      await button.click();
    };
    const makeDraft = async (title: string) => {
      await page.getByLabel("Work details").fill(`JOB: ${title}\nITEM: Paint walls | £200.00`);
      const response = page.waitForResponse(r => r.url().endsWith("/api/jobs/capture") && r.request().method() === "POST");
      await click("Make my draft");
      const saved = await response;
      expect(saved.ok()).toBe(true);
      return (await saved.json()).jobId as string;
    };

    await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    await click("＋ Start a new job");
    const draftTitle = "Fictional spare room";
    const draftId = await makeDraft(draftTitle);
    await page.goto(`/jobs/${draftId}/overview`);
    await click("Discard this draft");
    await expect(page.getByText("Discarding hides this draft. Nothing was sent to a customer.")).toBeVisible();
    await click("Keep it");
    await expect(page.getByRole("button", { name: "Yes, discard it" })).toHaveCount(0);
    await click("Discard this draft");
    await click("Yes, discard it");
    await expect(page).toHaveURL(/\/jobs$/);

    await page.getByRole("button", { name: "New job +", exact: true }).first().click();
    const quoteTitle = "Fictional blue room";
    const quoteId = await makeDraft(quoteTitle);
    await click("Check and edit my draft");
    await click("Save customer and site");
    await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
    await expect(page.getByRole("form", { name: "Customer and site details" }).locator("fieldset")).toBeEnabled();
    await click("Accept Paint walls");
    await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
    await click("Confirm scope");
    await expect(page.getByRole("button", { name: "Price the work", exact: true })).toBeEnabled();
    await page.goto(`/jobs/${quoteId}/overview`);
    await expect(page.getByTestId("designed-job-overview")).toBeVisible();
    await expect(page.getByRole("button", { name: "Discard this draft" })).toHaveCount(0);
    const detail = await page.request.get(`/api/jobs/${quoteId}`);
    expect(detail.ok()).toBe(true);
    const { job: quote } = await detail.json();
    expect(quote.status).toBe("quoting");
    const refusal = await page.request.post(`/api/jobs/${quoteId}/discard`, {
      data: { contractVersion: "draft_discard_v1", commandId: randomUUID(), expectedRevision: quote.revision },
    });
    expect(refusal.status()).toBe(400);

    for (const path of ["/jobs", "/today"]) {
      const loaded = page.waitForResponse(r => new URL(r.url()).pathname === "/api/jobs" && r.ok());
      await page.goto(path);
      await loaded;
      const listedQuote = path === "/today" ? page.getByRole("button", { name: quoteTitle, exact: true })
        : page.getByTestId("designed-jobs-list").getByText(quoteTitle, { exact: true });
      await expect(listedQuote).toBeVisible();
      await expect(page.getByText(draftTitle, { exact: true })).toHaveCount(0);
    }
  });
}
