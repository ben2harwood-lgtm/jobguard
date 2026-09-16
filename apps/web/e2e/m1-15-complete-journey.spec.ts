import { expect, test } from "@playwright/test";
import { openQuote } from "./helpers/capture-journey";

test("M1-15 complete synthetic journey retains the job spine and accepted scope", async ({ page }) => {
  test.setTimeout(60_000);
  await openQuote(page);

  const quote = page.locator(".quote-editor");
  const jobId = await quote.getAttribute("data-job-id");
  const scopeLineage = await quote.getAttribute("data-scope-lineage");
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
  expect(scopeLineage?.split(",")).toHaveLength(6);
  await page.getByLabel("Unit rate Replace shelves").fill("125.00");
  await page.getByRole("button", { name: "Save draft revision" }).click();
  await page.getByRole("button", { name: "Preview immutable quote" }).click();
  await page.getByRole("button", { name: "Simulate sending this quote" }).click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Queued — not sent");
  await page.getByRole("button", { name: "Continue fake worker" }).click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await page.getByRole("button", { name: "Record practice acceptance" }).click();
  await page.getByRole("button", { name: "Switch live · no-charge pilot" }).click();
  await expect(page.getByRole("heading", { name: "Live · baseline frozen" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: /Decisions/ }).first().click();
  await page.getByRole("button", { name: /Check the materials bill/ }).click();
  await page.getByRole("button", { name: "Dismiss suggestion" }).click();
  await expect(page.getByText("Dismissed — no action authorized")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Add a photo" }).click();
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  await page.getByLabel("Choose site photo").setInputFiles({ name: "runtime-proof.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Run synthetic server verification" }).click();
  await page.getByRole("button", { name: "Complete stage" }).click();
  await expect(page.getByText("Proof complete · verified evidence linked")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Add extra work" }).click();
  await page.getByLabel("Use approved fixture audio transcript").check();
  await page.getByRole("button", { name: "Create variation proposal" }).click();
  await page.getByLabel("Confirmed rate pence").fill("12500");
  await page.getByRole("button", { name: "Confirm price" }).click();
  await page.getByRole("button", { name: "Record approval for this exact revision" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: "Prepare the final bill" }).click();
  const account = page.locator(".final-account");
  await expect(account).toHaveAttribute("data-job-id", jobId!);
  await expect(account).toHaveAttribute("data-scope-lineage", scopeLineage!);
  await expect(page.getByText(/Accepted facts reused from document v1 · no re-typing/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accepted commercial history" })).toBeVisible();
  await page.getByRole("button", { name: "Approve synthetic issue + fake send" }).click();
  await page.getByRole("button", { name: "Record £750 payment" }).click();
  await page.getByRole("button", { name: "Record remaining £750" }).click();
  await expect(page.getByRole("heading", { name: "Payment: paid" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "See the fee example" }).click();
  await expect(page.getByText("ILLUSTRATIVE ONLY — NOT A PLATFORM TAX INVOICE")).toBeVisible();
  await expect(page.getByText(/No collectible platform balance/)).toBeVisible();
  await page.screenshot({ path: `/tmp/jobguard-m1-15-${test.info().project.name}.png`, fullPage: true });
});
