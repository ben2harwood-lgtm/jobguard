import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { jsonResult } from "./customer-invoice-journey";
import type { PricedCatch } from "./j3-customer-approval";

const tenantId = "11111111-1111-4111-8111-111111111111";
const nativeImport = <T>(path: string) => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<T>)(pathToFileURL(join(process.cwd(), path)).href);

/** Continue the SAME job by clicks. Requests here only read saved state or replay a command the page just sent. */
export async function settleJ3(page: Page, jobId: string, lockId: string, catches: PricedCatch[], info: TestInfo) {
 const path = `/api/jobs/${jobId}`, guide = `/jobs/${jobId}/shadow-journey`;
 const read = (suffix: string) => jsonResult(page.request.get(`${path}/${suffix}`), suffix);
 const post = (suffix: string, data: unknown) => jsonResult(page.request.post(`${path}/${suffix}`, { data }), suffix);
 const clickOn = async (name: string) => { const control = page.getByRole("button", { name, exact: true }); await expect(control).toBeEnabled({ timeout: 45_000 }); await control.click(); };
 // Customer approval may advance the bill: rebuild, then issue the one combined invoice.
 await page.goto(guide);
 await clickOn("Rebuild the bill");
 await expect(page.getByTestId("guide-bill")).toHaveText("£34,400.00 net / £41,280.00 gross", { timeout: 30_000 });
 const final = await read("final-account/lock");
 expect(final.lock.id).toBe(lockId);
 expect(final.account.id).not.toBe(final.lock.finalAccountRevisionId);
 expect(final.invoiceGuard).toBeNull();
 expect(final.account.issueBlocked).toBe(false);
 expect(final.account.totals).toMatchObject({ net: { pence: 3440000 }, tax: { pence: 688000 }, total: { pence: 4128000 } });
 const issueRequest = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/final-account/lock"));
 await clickOn("Issue this one invoice");
 const issue = (await issueRequest).postDataJSON();
 await expect(page.getByTestId("guide-invoice")).toContainText("£34,400.00 net / £41,280.00 gross", { timeout: 30_000 });
 const issued = await post("final-account/lock", issue);
 expect(await post("final-account/lock", issue)).toEqual(issued);
 const stale = await page.request.post(`${path}/final-account/lock`, { data: { ...issue, commandId: randomUUID(), expectedSourceHash: "0".repeat(64) } });
 expect(stale.status()).toBe(409);
 expect(await stale.json()).toEqual({ code: "STALE_REVISION" });
 expect(issued.invoices).toHaveLength(1);
 const invoice = issued.invoices[0];
 expect(invoice).toMatchObject({ finalAccountRevisionId: final.account.id, sourceHash: final.account.sourceHash, netPence: 3440000, totalPence: 4128000, balancePence: 4128000 });
 await expect(page.getByTestId("guide-invoice")).toContainText("£34,400.00 net / £41,280.00 gross");
 // The practice receipt and its settled movement, on the job screens.
 await page.goto(`/jobs/${jobId}#final-account-title`);
 await page.getByTestId("uiwire12-receipt-amount").fill("41280.00");
 await clickOn("Record practice receipt");
 const receiptPath = `customer-invoices/${invoice.id}/receipts`;
 await expect.poll(async () => (await read(receiptPath)).receipts.length, { timeout: 30_000 }).toBe(1);
 const paymentId = (await read(receiptPath)).receipts[0].id as string;
 await page.goto(`/jobs/${jobId}#practice-receipts`);
 const panel = page.locator("#practice-receipts");
 await expect(panel).toHaveAttribute("aria-busy", "false");
 await panel.getByRole("button", { name: "Connect practice feed", exact: true }).click();
 await expect(panel.getByTestId("practice-feed-state")).toHaveText("Connected");
 await panel.getByLabel("Generated movement", { exact: true }).selectOption("receipt-41280");
 await panel.getByLabel("Generated event", { exact: true }).selectOption("settled");
 await panel.getByRole("button", { name: "Advance practice executor", exact: true }).click();
 await expect(panel.locator('[data-movement-key="receipt-41280"]').first()).toBeVisible();
 await panel.getByRole("button", { name: "Match £41,280.00 receipt to its settled movement", exact: true }).click();
 await expect(panel.getByTestId("receipt-matched-movement").filter({ hasText: "receipt-41280" })).toBeVisible();
 expect((await read("customer-invoices")).invoices).toEqual([expect.objectContaining({ id: invoice.id, balancePence: 0 })]);
 // Step 7: split the settled receipt across the exact bill lines, on the guide.
 await page.goto(guide);
 await clickOn("Review the line split");
 await expect(page.getByTestId("guide-lines-state")).toHaveText("Review ready to approve");
 await clickOn("Approve this exact line split");
 await expect(page.getByTestId("guide-lines-state")).toHaveText("Line split saved");
 const lines = await read("receipt-case-allocations");
 const cases = (await read("recovery-cases")).cases;
 const assessments = [];
 const packs: { caseId: string; manifestHash: string }[] = [];
 {
  for (const item of catches) {
   const recovery = cases.find((row: { caseType: string; sourceRefs: string[] }) => row.caseType === "missed_variation_final_account" && row.sourceRefs.includes(`variation:${item.id}`));
   expect(recovery, "Pricing must open the source-bound catch case").toBeDefined();
   const currentRevision = item.revisions.find(row => row.id === item.currentRevisionId)!;
   expect(recovery.claimedNetPence).toBe(currentRevision.signedDeltaPence);
   const line = lines.rows.find((row: { commercialRevisionId: string }) => row.commercialRevisionId === item.currentRevisionId);
   expect(line, "Combined invoice must contain the exact approved revision").toBeDefined();
   expect(line.net).toEqual({ numerator: String(currentRevision.signedDeltaPence), denominator: "1" });
   // Step 8 inputs: allocate, assess and record the review of this catch, on the guide.
   const name = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(recovery.claimedNetPence / 100);
   const row = page.locator(`[data-case-id="${recovery.id}"]`);
   const state = row.getByTestId("guide-case-state");
   await row.getByRole("button", { name: `Review allocation of ${name}`, exact: true }).click();
   await expect(state).toHaveText("Allocation ready to approve");
   await row.getByRole("button", { name: `Approve allocation of ${name}`, exact: true }).click();
   await expect(state).toHaveText("Allocated");
   const assess = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/success-fee-attribution"));
   await row.getByRole("button", { name: `Assess ${name}`, exact: true }).click();
   const assessCommand = (await assess).postDataJSON();
   await expect(state).toHaveText(`Assessed: ${name} remains`);
   const assessed = await post("success-fee-attribution", assessCommand); // Replay returns the saved assessment.
   expect(assessed.assessment).toMatchObject({ assessmentOutcome: "eligible_for_review", reasonCodes: [], remainingPrincipal: line.net });
   for (const fact of Object.values(assessed.assessment.facts.facts) as { holds: boolean }[]) expect(fact.holds).toBe(true);
   const approveReview = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/success-fee-attribution"));
   await row.getByRole("button", { name: `Approve assessment review of ${name}`, exact: true }).click();
   const reviewCommand = (await approveReview).postDataJSON();
   await expect(state).toHaveText("Assessment review recorded");
   expect(await post("success-fee-attribution", reviewCommand)).toMatchObject({ effect: "review_recorded", productionEnabled: false, realExternalActions: 0 });
   assessments.push(assessed);
  }
  const { sumExactPence, parseExactPence, serializeExactPence, verifyStandalonePackV3 } = await nativeImport<typeof import("@jobguard/core")>("../../packages/core/dist/index.js");
  expect(serializeExactPence(sumExactPence(assessments.map(row => parseExactPence(row.assessment.remainingPrincipal))))).toEqual({ numerator: "80000", denominator: "1" });
  expect(assessments.reduce((sum, row) => sum + row.valueReceipt.fee.pence, 0)).toBe(8000);
  expect(serializeExactPence(sumExactPence(assessments.map(row => parseExactPence(row.valueReceipt.yoursBeforeVatAndTax))))).toEqual({ numerator: "72000", denominator: "1" });
  await page.goto(`/jobs/${jobId}`);
  await page.getByRole("button", { name: "Prepare fee statement", exact: true }).click();
  await expect(page.getByTestId("payment-received")).toHaveText("£41,280.00");
  await expect(page.getByTestId("payment-qualifying-net")).toHaveText("£800.00");
  await expect(page.getByTestId("payment-fee")).toHaveText("£80.00");
  await expect(page.getByTestId("payment-yours-before-tax")).toHaveText("£720.00");
  await expect(page.getByRole("region", { name: "Receipt fee statements" })).toContainText("VAT not calculated in this simulation");
  await page.getByRole("button", { name: "Approve this exact fee statement", exact: true }).click();
  await expect(page.getByRole("region", { name: "Receipt fee statements" })).toContainText("Approved for simulation");
  // Each catch has its own automatic case; prove both source chains, not only one.
  for (const assessed of assessments) {
   await page.goto(`/jobs/${jobId}`);
   const recovery = cases.find((row: { id: string }) => row.id === assessed.assessment.caseId);
   const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(recovery.claimedNetPence / 100);
   await page.getByRole("button", { name: `missed variation final account · ${amount}`, exact: true }).click();
   await expect(page.getByRole("article", { name: "Selected recovery case" })).toContainText(recovery.sourceRefs.find((ref: string) => ref.startsWith("variation:")));
   await page.getByRole("button", { name: "Open lock and reveal packs", exact: true }).click();
   await page.getByRole("button", { name: "Build lock and reveal pack", exact: true }).click();
   const explorer = page.getByTestId("pack-v3-explorer");
   await expect(explorer).toContainText("Content matches manifest", { timeout: 180_000 });
   const url = await explorer.getByRole("link", { name: "Download lock and reveal pack" }).getAttribute("href");
   const response = await page.request.get(url!); expect(response.ok()).toBe(true);
   const text = await response.text(), verified = verifyStandalonePackV3(text), artifact = JSON.parse(text);
   await expect(explorer.getByTestId("pack-v3-manifest-hash")).toHaveText(verified.manifestHash);
   expect(artifact.manifest.sections.every((section: { status: string }) => section.status === "present")).toBe(true);
   for (const sourceId of [`customer_payment:${paymentId}`, `recovery_attribution_revision:${assessed.assessment.assessmentId}`]) expect(artifact.sources.some((source: { sourceId: string }) => source.sourceId === sourceId)).toBe(true);
   const file = info.outputPath(`${assessed.assessment.caseId}-pack.txt`); await writeFile(file, text);
   const cli = spawnSync(process.execPath, [resolve(process.cwd(), "../../packages/db/tools/verify-evidence-pack.mjs"), file], { encoding: "utf8" });
   expect(cli.error).toBeUndefined(); expect(JSON.parse(cli.stdout)).toMatchObject(verified);
   expect(cli.status).toBe(1); // No independent checkpoint supplied; retain that limitation.
   await explorer.getByRole("button", { name: "Approve lock and reveal pack for attachment", exact: true }).click();
   await expect(explorer).toContainText("Approval recorded for these exact hashes", { timeout: 180_000 });
   packs.push({ caseId: assessed.assessment.caseId, manifestHash: verified.manifestHash });
  }
 }
 return { invoice, paymentId, assessments, packs, final };
}
