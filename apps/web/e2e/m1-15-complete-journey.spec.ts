import { expect, test } from "@playwright/test";

test("M1-15 complete synthetic journey retains the job spine and accepted scope", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with demo code" }).click();
  await page.getByRole("button", { name: "Walk a new job" }).click();
  await page.getByRole("button", { name: "Create draft proposal" }).click();
  await page.getByRole("button", { name: "Review proposal" }).click();
  for (const button of await page.getByRole("button", { name: "Accept", exact: true }).all()) await button.click();
  await page.getByLabel(/Disposition Confirm disposal/).selectOption("answered");
  await page.getByRole("button", { name: "Confirm scope and start quoting" }).click();
  await page.getByRole("button", { name: "Price the work" }).click();

  const quote = page.locator(".quote-editor");
  const jobId = await quote.getAttribute("data-job-id");
  const scopeLineage = await quote.getAttribute("data-scope-lineage");
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
  expect(scopeLineage?.split(",")).toHaveLength(6);
  await page.getByLabel("Unit rate Replace damaged skirting").fill("125.00");
  await page.getByRole("button", { name: "Preview immutable quote" }).click();
  await page.getByRole("button", { name: "Approve exact version and fake-send" }).click();
  await page.getByRole("button", { name: "Record builder attestation" }).click();
  await page.getByRole("button", { name: "Switch live · no-charge pilot" }).click();
  await expect(page.getByRole("heading", { name: "Live · baseline frozen" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: /Decisions/ }).first().click();
  await page.getByRole("button", { name: /Check the materials bill/ }).click();
  await page.getByRole("button", { name: "Dismiss suggestion" }).click();
  await expect(page.getByText("Dismissed — no action authorized")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Capture proof" }).click();
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  await page.getByLabel("Choose site photo").setInputFiles({ name: "runtime-proof.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Run synthetic server verification" }).click();
  await page.getByRole("button", { name: "Complete stage" }).click();
  await expect(page.getByText("Proof complete · verified evidence linked")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Log an extra" }).click();
  await page.getByLabel("Use approved fixture audio transcript").check();
  await page.getByRole("button", { name: "Create variation proposal" }).click();
  await page.getByLabel("Confirmed rate pence").fill("12500");
  await page.getByRole("button", { name: "Confirm price" }).click();
  await page.getByRole("button", { name: "Record approval for this exact revision" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: "Draft final account" }).click();
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
  await page.getByRole("button", { name: "Fee illustration" }).click();
  await expect(page.getByText("ILLUSTRATIVE ONLY — NOT A PLATFORM TAX INVOICE")).toBeVisible();
  await expect(page.getByText(/No collectible platform balance/)).toBeVisible();
  await page.screenshot({ path: `/tmp/jobguard-m1-15-${test.info().project.name}.png`, fullPage: true });
});
