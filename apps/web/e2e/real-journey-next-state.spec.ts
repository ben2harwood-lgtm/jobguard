import { expect, test } from "@playwright/test";
import { z } from "zod";
import { jobWorkspaceResponseV1 } from "../../api/src/workspace/contracts";
import { variationWorkspaceResponseV1 } from "../../api/src/variation/contracts";
import { finalAccountResponseV1 } from "../../api/src/final-account.contracts";
import { practiceInvoiceResponseV1 } from "../../api/src/customer-invoice.contracts";
import { derivePracticeNextStep } from "../app/ui/practice-next-step";

// These selections mirror the existing proof/lock/reveal screen read contracts.
// They validate actual authenticated responses, never supply server facts.
const uuid = z.string().uuid();
const proofView = z.object({ version: z.literal("practice-proof-view.v1"), environment: z.literal("synthetic_demo"), jobId: uuid,
  completion: z.object({ id: uuid, reviewRequired: z.boolean() }).nullable(), realExternalActions: z.literal(0) });
const lockView = z.object({ version: z.literal("final-account-lock.view.v1"), jobId: uuid,
  lock: z.object({ id: uuid }).nullable() });
const checkView = z.object({ state: z.enum(["unlocked", "pending", "failed", "completed"]), lockId: uuid.optional() });

test("walk 2 saved facts select the no-extra account and paid end states", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
  testInfo.annotations.push({ type: "integration remaining", description:
    "PracticeJourney does not consume this function yet. Existing visible controls are used throughout; real-journey-next-to-paid owns the link integration." });
  const click = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled(); await button.click();
  };
  let jobId = "";
  const read = async <T>(suffix: string, schema: z.ZodType<T>): Promise<T> => {
    const response = await page.request.get(`/api/jobs/${jobId}${suffix}`);
    expect(response.ok(), `${suffix}: ${response.status()} ${await response.text()}`).toBe(true);
    return schema.parse(await response.json());
  };
  const savedFacts = async (checkpoint: string) => {
    const [workspace, proof, variations, account, lock, check, invoices] = await Promise.all([
      read("", jobWorkspaceResponseV1), read("/proof", proofView), read("/variations", variationWorkspaceResponseV1),
      read("/final-account", finalAccountResponseV1), read("/final-account/lock", lockView),
      read("/final-check", checkView), read("/customer-invoices", practiceInvoiceResponseV1),
    ]);
    const facts = { job: workspace.job, proof, variations, account, lock, check, invoices };
    const result = derivePracticeNextStep(facts);
    await testInfo.attach(checkpoint, { contentType: "application/json", body: JSON.stringify({ facts, result }, null, 2) });
    return { facts, result };
  };

  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
  await click("＋ Start a new job");
  await page.getByLabel("Work details").fill("Practice decorating. Protect room £200.00. Prepare walls £200.00. Paint walls £200.00. Finish trim £200.00. Clean site £100.00. Replace shelves");
  await click("Make my draft"); await click("Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  jobId = new URL(page.url()).pathname.split("/").at(-1)!;
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
  await click("Preview immutable quote"); await click("Simulate sending this quote"); await click("Continue fake worker");
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await click("Record practice acceptance"); await click("Start this practice job");
  await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#quote`);
  await click("Attach generated practice image"); await click("Check file integrity"); await click("Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  const afterProof = await savedFacts("after-proof-no-extras");
  expect(afterProof.facts.variations.variations).toHaveLength(0);
  expect(afterProof.result).toMatchObject({ nextStep: "review_account", completion: "incomplete" });
  await click("Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
  await click("Build final account");
  const panel = page.getByTestId("final-account-lock");
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  const dispositions = panel.getByRole("combobox");
  await expect(dispositions).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    await dispositions.nth(index).selectOption("done"); await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
  if (await terms.isEnabled()) await terms.click();
  await expect(panel.getByText("Final check terms accepted.", { exact: true })).toBeVisible();
  await click("Complete final account");
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  const checkPanel = page.getByTestId("final-check-reveal");
  const readCheck = async () => {
    await click("Load the saved final check"); await expect(checkPanel).toHaveAttribute("aria-busy", "false");
    return read("/final-check", checkView);
  };
  const initialCheck = await readCheck();
  expect(initialCheck.state).not.toBe("failed");
  if (initialCheck.state !== "completed") {
    await click("Run the final check (practice)");
    await expect.poll(async () => (await readCheck()).state, { timeout: 180_000, intervals: [3000] }).not.toBe("pending");
  }
  expect((await readCheck()).state).toBe("completed");
  await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
  expect((await savedFacts("completed-check-no-invoice")).result.nextStep).toBe("issue_invoice");
  await click("Issue and simulate this invoice");
  await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,080.00");
  const issued = await savedFacts("after-invoice-issue");
  expect(issued.facts.invoices.invoices).toHaveLength(1);
  expect(issued.facts.invoices.invoices[0]?.totalPence).toBe(108000);
  expect(issued.result).toMatchObject({ nextStep: "record_payment", completion: "incomplete", payment: { state: "unpaid" } });
  for (const [reference, balance, completion, payment] of [
    ["Fictional first half", "GBP 540.00", "incomplete", "part_paid"],
    ["Fictional second half", "GBP 0.00", "paid", "paid"],
  ] as const) {
    await page.getByTestId("uiwire12-receipt-amount").fill("540.00");
    await page.getByTestId("uiwire12-receipt-reference").fill(reference);
    await click("Record practice receipt"); await expect(page.getByTestId("invoice-balance")).toHaveText(balance);
    expect((await savedFacts(payment === "paid" ? "after-full-payment" : "after-partial-payment")).result)
      .toMatchObject({ nextStep: completion === "paid" ? "complete" : "record_payment", completion, payment: { state: payment } });
  }
  await testInfo.attach("existing-controls-after-paid", { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
  // No assertion claims the current next-step link consumes the new calculation.
  await page.goto(`/jobs/${jobId}/value`);
  await expect(page.getByTestId("value-invoiced-gross")).toHaveText("£1,080.00");
  await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,080.00");
  await expect(page.getByTestId("value-outstanding-gross")).toHaveText("£0.00");
});
