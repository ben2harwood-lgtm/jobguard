import { expect, test } from "@playwright/test";
import { openCaptureDesigned } from "./helpers/capture-journey-designed";

// Regressions found by the Tommy demo walkthroughs (24 Nov 2026), on the designed own-job path.
const capture = [
  "JOB: Practice decorating",
  "ITEM: Paint walls | £200.00",
  "ITEM: Clean site | £100.00",
].join("\n");

test("TOMMY-DEMO: half-typed quote numbers never crash the page, and a not-live job's diary is calm", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await openCaptureDesigned(page);
  const click = (name: string) => page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Work details").fill(capture);
  await click("Make my draft");
  await click("Check and edit my draft");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/work$/u);
  const jobId = new URL(page.url()).pathname.split("/")[2]!;

  // A job that is not live yet shows a plain notice for its diary and messages, not a load error.
  const diary = page.getByTestId("job-diary");
  await expect(diary.getByTestId("job-sources-not-live")).toBeVisible();
  await expect(diary.getByText("Could not load. Try again.")).toHaveCount(0);
  // Before the scope is confirmed there is no proof record yet; that is said plainly, not as an error.
  await expect(page.getByText("Proof opens once the scope is confirmed and the job is under way.")).toBeVisible();
  await expect(page.getByText("This proof record could not load. Try again.")).toHaveCount(0);

  await click("Accept Paint walls");
  await click("Accept Clean site");
  await click("Confirm scope");
  await expect(page.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await page.getByLabel("Customer name", { exact: true }).fill("Tommy Demo Customer");
  await page.getByLabel("Premises address", { exact: true }).fill("14 Fictional Lane");
  await click("Save customer and site");
  await click("Price the work");
  const editor = page.locator(".designed-quote");
  await expect(editor).toHaveAttribute("data-quote-ready", "true");
  await expect(editor.getByTestId("quote-net")).toHaveText("GBP 300.00");

  // Typed key by key, as a person does: "2." used to throw inside the totals and blank the page.
  const quantity = editor.getByLabel("Quantity Paint walls", { exact: true });
  await quantity.click();
  await quantity.press("ControlOrMeta+a");
  await quantity.pressSequentially("2.");
  await expect(quantity).toHaveValue("2.");
  await expect(editor.getByText(/Enter a quantity such as 1 or 2\.5/u)).toBeVisible();
  await expect(editor.getByRole("button", { name: "Save draft revision", exact: true })).toBeDisabled();
  await quantity.pressSequentially("5");
  await expect(editor.getByTestId("quote-net")).toHaveText("GBP 600.00");
  await expect(editor.getByRole("button", { name: "Save draft revision", exact: true })).toBeEnabled();

  for (const typed of ["abc", "-3"]) {
    await quantity.fill("");
    await quantity.pressSequentially(typed);
    await expect(editor.getByText(/Enter a quantity such as 1 or 2\.5/u)).toBeVisible();
  }
  await quantity.fill("2.5");

  const discount = editor.getByLabel("Discount Paint walls", { exact: true });
  await discount.click();
  await discount.pressSequentially("150");
  await expect(editor.getByText(/Enter a discount from 0 to 100/u)).toBeVisible();
  await discount.fill("10");

  // A builder's thousands comma is read as the price.
  const rate = editor.getByLabel("Unit rate Clean site", { exact: true });
  await rate.click();
  await rate.pressSequentially("1,250.50");
  await expect(rate).toHaveValue("1,250.50");
  await expect(editor.getByTestId("quote-net")).toHaveText("GBP 1,700.50");

  await click("Save draft revision");
  await expect(editor.getByTestId("quote-revision")).toHaveText("1");
  expect(pageErrors).toEqual([]);

  // The designed back button returns to the designed Jobs list, not the classic home.
  await page.goto(`/jobs/${jobId}/work#scope`);
  await page.getByRole("button", { name: "← Jobs", exact: true }).first().click();
  await expect(page).toHaveURL(/\/jobs$/u);
});
