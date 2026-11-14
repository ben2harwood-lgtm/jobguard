import { expect, test } from "@playwright/test";
import { JOB_DIARY_NOTICE } from "@jobguard/core";

test("REAL-DIARY-EXTRA-LINK: own job diary opens reachable extra-work controls", async ({ page }, testInfo) => {
 test.setTimeout(360_000);
 if (testInfo.project.name.includes("mobile")) await page.setViewportSize({ width: 390, height: 844 });
 const click = async (name: string) => { const button = page.getByRole("button", { name, exact: true }); await expect(button).toBeEnabled(); await button.click(); };
 await page.goto("/practice-company");
 await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
 await click("＋ Start a new job");
 await page.getByLabel("Work details").fill(`JOB: Practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves`);
 await click("Make my draft"); await click("Check and edit my draft");
 await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
 const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
 await click("Save customer and site");
 await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
 for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(`Accept ${name}`);
 await click("Dismiss Replace shelves");
 await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional job");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 await click("Confirm scope"); await click("Price the work");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
 await expect(page.getByTestId("quote-net")).toHaveText("GBP 900.00");
 await click("Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await click("Preview immutable quote"); await click("Simulate sending this quote");
 await click("Continue fake worker");
 await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
 await click("Record practice acceptance"); await click("Start this practice job");
 await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();

 for (const [path, href] of [
  [`/jobs/${jobId}#quote`, "#variations-title"],
  [`/jobs/${jobId}/records`, `/jobs/${jobId}/work#variations-title`],
 ] as const) {
  await page.goto(path);
  const notice = page.getByTestId("diary-notice");
  await expect(notice).toHaveText(JOB_DIARY_NOTICE);
  const link = notice.getByRole("link", { name: "Log an extra", exact: true });
  await expect(link).toHaveAttribute("href", href);
  await link.click();
  await expect(page).toHaveURL(url => url.hash === "#variations-title" && (href.startsWith("#") || url.pathname === `/jobs/${jobId}/work`));
  const heading = page.getByRole("heading", { name: "Extra work and omissions", exact: true });
  await expect(heading).toBeInViewport();
  const description = page.locator(".variation-workspace").getByLabel("Description", { exact: true });
  await expect(description).toBeEnabled();
  await description.focus();
  await expect(description).toBeFocused();
 }
});
