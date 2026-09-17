import { expect, test, type Page } from "@playwright/test";
async function click(page:Page,name:string){const button=page.getByRole("button",{name,exact:true});await expect(button).toBeVisible();await expect(button).toBeEnabled();await button.click();}
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
  await click(page, "Save draft revision");
  await click(page, "Preview immutable quote");
  await click(page, "Simulate sending this quote");
  await expect(page.getByTestId("quote-delivery")).toHaveText("Queued — not sent");
  await click(page, "Continue fake worker");
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await click(page, "Record practice acceptance");
  await click(page, "Start this practice job");
  await expect(page.getByRole("heading", { name: "Live · baseline frozen" })).toBeVisible();

  // Seed this job's deterministic findings so the (job-scoped) Decisions inbox
  // shows exactly this job's items, matching the UIWIRE-6 persisted-findings
  // architecture; the evaluate command also sets the jg_decision_job scope cookie.
  const seedFindings = await page.request.post("/api/decisions", { data: { version: "finding-evaluation-command.v1", commandId: crypto.randomUUID(), tenantId: "11111111-1111-4111-8111-111111111111", jobId: jobId! } });
  expect(seedFindings.status()).toBe(200);

  await page.goto("/");
  const decisions=page.getByRole("button", { name: /Decisions/ }).first(); await expect(decisions).toBeVisible(); await expect(decisions).toBeEnabled(); await decisions.click();
  await page.getByRole("button", { name: /Check the materials bill/ }).click();
  await click(page, "Dismiss suggestion");
  await expect(page.getByText("Dismissed — no action authorized")).toBeVisible();

  await page.goto("/");
  await click(page, "Add a photo");
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  await page.getByLabel("Choose site photo").setInputFiles({ name: "runtime-proof.png", mimeType: "image/png", buffer: png });
  await click(page, "Run synthetic server verification");
  await click(page, "Complete stage");
  await expect(page.getByText("Proof complete · verified evidence linked")).toBeVisible();

  await page.goto("/");
  await click(page, "Add extra work");
  await page.getByLabel("Use approved fixture audio transcript").check();
  await click(page, "Create variation proposal");
  await page.getByLabel("Confirmed rate pence").fill("12500");
  await click(page, "Confirm price");
  await click(page, "Record approval for this exact revision");

  await page.goto("/");
  await click(page, "Prepare the final bill");
  const account = page.locator(".final-account");
  await expect(account).toHaveAttribute("data-job-id", jobId!);
  await expect(account).toHaveAttribute("data-scope-lineage", scopeLineage!);
  await expect(page.getByText(/Accepted facts reused from document v1 · no re-typing/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accepted commercial history" })).toBeVisible();
  await click(page, "Approve synthetic issue + fake send");
  await click(page, "Record £750 payment");
  await click(page, "Record remaining £750");
  await expect(page.getByRole("heading", { name: "Payment: paid" })).toBeVisible();

  await page.goto("/");
  await click(page, "See the fee example");
  await expect(page.getByText("ILLUSTRATIVE ONLY — NOT A PLATFORM TAX INVOICE")).toBeVisible();
  await expect(page.getByText(/No collectible platform balance/)).toBeVisible();
  await page.screenshot({ path: `/tmp/jobguard-m1-15-${test.info().project.name}.png`, fullPage: true });
});
