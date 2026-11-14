import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { openCapture, startWatchdogJob } from "./helpers/capture-journey";
import { jsonResult } from "./helpers/customer-invoice-journey";
import type { FinalCheckRead } from "../app/ui/final-check-reveal-view";
import { approveJ3Catches } from "./helpers/j3-customer-approval";
import { settleJ3 } from "./helpers/j3-settlement";
import { finishDispositionsAndTerms } from "./helpers/final-account-lock-journey";

// A person's path through DEMO-S steps 1–9, on both phone and desktop: clicks on the job, its
// practice guide and the customer portal. No database connection, producer call or seeded state.
// API requests here only read saved state or replay a command the page just sent.
async function completeJ3(page: Page, browser: Browser, testInfo: TestInfo) {
 test.setTimeout(720_000);
 await openCapture(page); await page.goto("/demo-s/shadow-30000");
 const create = page.getByRole("button", { name: "Create or resume the £30,000 practice job" });
 await create.click();
 const reference = page.getByLabel("Saved job reference");
 await expect(reference).not.toHaveValue(""); const jobId = await reference.inputValue();
 await page.reload(); await expect(reference).toHaveValue(jobId);
 await create.click(); await expect(reference).toHaveValue(jobId);
 await page.getByRole("link", { name: "Continue this job through its real controls" }).click();
 await page.getByRole("button", { name: "Save customer and site", exact: true }).click();
 await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
 for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await page.getByRole("button", { name: `Accept ${name}`, exact: true }).click();
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 await page.getByRole("button", { name: "Confirm scope", exact: true }).click();
 await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
 const price = page.getByRole("button", { name: "Price the work", exact: true });
 await expect(price).toBeVisible(); await expect(price).toBeEnabled(); await price.click();
 await startWatchdogJob(page);
 const post = (path: string, data: unknown) => jsonResult(page.request.post(`/api/jobs/${jobId}/${path}`, { data }), path); // Replays only; each first command comes from a click.
 const read = (path: string) => jsonResult(page.request.get(`/api/jobs/${jobId}/${path}`), path);
 const quote = await read("quotes"); expect(quote.revisions.at(-1).netPence).toBe(3000000);
 const guide = `/jobs/${jobId}/shadow-journey`;
 const clickOn = async (name: string) => { const control = page.getByRole("button", { name, exact: true }); await expect(control).toBeEnabled({ timeout: 45_000 }); await control.click(); };
 // Step 2: £3,200 logged on the job screen. Builder-recorded practice acceptance only.
 const addExtra = async (description: string, amount: string) => {
  const form = page.locator(".variation-entry"); await expect(form).toBeVisible();
  await form.getByLabel("Description", { exact: true }).fill(description);
  await form.getByLabel("Variation price (£, optional)").fill(amount);
  await clickOn("Add proposed variation");
  await expect(form.getByLabel("Description", { exact: true })).toHaveValue("");
 };
 const variationNamed = async (description: string) => {
  await expect.poll(async () => (await read("variations")).variations.some((v: { description: string }) => v.description === description)).toBe(true);
  return (await read("variations")).variations.find((v: { description: string }) => v.description === description) as { id: string; currentRevisionId: string };
 };
 const approveOnJob = async (id: string) => {
  const row = page.getByTestId(`variation-${id}`);
  await row.getByRole("button", { name: "Approve exact revision", exact: true }).click();
  await expect(row.getByText("Approved immutable commercial fact", { exact: true })).toBeVisible();
 };
 await addExtra("Fictional builder logged extras", "3200.00");
 const proposalId = (await variationNamed("Fictional builder logged extras")).id;
 await approveOnJob(proposalId);
 // Step 3 sources. The photo comes from the guide's generated drainage image.
 await page.goto(guide);
 await clickOn("Check what proof this job needs");
 await expect(page.getByTestId("guide-proof-state")).toHaveText("Proof required");
 await clickOn("Attach the generated drainage photo");
 await expect(page.getByTestId("guide-proof-state")).toHaveText("Photo attached");
 await clickOn("Check file integrity");
 await expect(page.getByTestId("guide-proof-state")).toHaveText("Photo checked");
 await clickOn("Record proof complete");
 await expect(page.getByTestId("guide-proof-state")).toHaveText("Proof complete");
 // The material invoice is examined honestly as zero-result, not labelled extra work.
 await page.goto(`/jobs/${jobId}#supplier-documents`);
 const documents = page.locator("#supplier-documents");
 await documents.locator("select").first().selectOption("materials-320-invoice");
 const intake = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith("/supplier-documents/intake"));
 await documents.getByRole("button", { name: "Import generated document", exact: true }).click();
 await post("supplier-documents/intake", (await intake).postDataJSON()); // Replaying the same command is safe.
 await page.goto(`/jobs/${jobId}#job-diary`);
 const diaryPanel = page.getByTestId("job-diary");
 await expect(diaryPanel).toHaveAttribute("aria-busy", "false");
 await diaryPanel.getByLabel("Note", { exact: true }).fill("Fictional practice diary: fitted loft hatch. Estimated extra: £300 net.");
 const diaryRequest = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith("/diary"));
 await diaryPanel.getByRole("button", { name: "Save note", exact: true }).click();
 const diary = (await diaryRequest).postDataJSON();
 await expect(diaryPanel.getByLabel("Note", { exact: true })).toHaveValue("");
 const note = await post("diary", diary);
 expect(await post("diary", diary)).toEqual(note);
 expect((await read("diary")).entries).toHaveLength(1);
 const conflict = await page.request.post(`/api/jobs/${jobId}/diary`, { data: { ...diary, text: "Different fictional work." } });
 expect(conflict.ok()).toBe(false);
 // Step 4 begins: build from baseline and captures, then accept the terms on the same panel.
 await page.goto(`/jobs/${jobId}#final-account-title`);
 await clickOn("Build final account");
 await expect.poll(async () => (await read("final-account")).account?.totals.net.pence).toBe(3320000);
 await page.reload();
 const lockPanel = page.getByTestId("final-account-lock");
 await expect(lockPanel.getByTestId("lock-state")).toHaveText("Final account review");
 // Terms are accepted once per business, so another practice job in this tenant may already have done it.
 const accept = lockPanel.getByRole("button", { name: "Accept final check terms", exact: true });
 if (await accept.isEnabled()) await accept.click();
 await expect(lockPanel.getByRole("button", { name: "Accept final check terms", exact: true })).toBeDisabled();
 const publicBefore = await read("shadow-demo");
 // Step 3: the guide asks the real worker to hold signals. Its answer never says what it held.
 await page.goto(guide);
 await expect(page.getByTestId("guide-hold-state")).toHaveText("Not asked for yet");
 await clickOn("Hold signals from saved sources");
 await expect(page.getByTestId("guide-hold-state")).toHaveText("Saved sources examined", { timeout: 180_000 });
 expect(await read("shadow-demo")).toEqual(publicBefore); // Holding signals cannot change a builder response.
 expect(await read("final-check")).toMatchObject({ state: "unlocked", items: [] });
 // Step 4: £400 at review, approved, then the rebuild.
 await page.goto(`/jobs/${jobId}#final-account-title`);
 await expect(lockPanel.getByTestId("lock-state")).toHaveText("Final account review");
 await lockPanel.getByLabel("Final-review extra description").fill("Fictional extra at final review");
 await lockPanel.getByLabel("Final-review extra price (£, optional)").fill("400.00");
 await lockPanel.getByRole("button", { name: "Add final-review extra", exact: true }).click();
 const reviewId = (await variationNamed("Fictional extra at final review")).id;
 await page.reload();
 await approveOnJob(reviewId);
 await clickOn("Rebuild from approved sources");
 await expect.poll(async () => (await read("final-account")).account.totals.net.pence).toBe(3360000);
 const final = await read("final-account");
 const before = await read("shadow-demo"); expect(before.account.captures.map((c: { netPence: number }) => c.netPence).sort()).toEqual([320000, 40000]);
 expect(before).not.toHaveProperty("finalCheck"); expect(before).not.toHaveProperty("assessments");
 expect(before.version).toBe("shadow-demo-report.v2");
 expect(before.customerApproval).toEqual({ state: "not_ready_yet", approvals: [] }); expect(before.invoices.invoices).toEqual([]);
 // Step 5: the lock.
 await page.goto(`/jobs/${jobId}#final-account-title`); await finishDispositionsAndTerms(page);
 await page.getByRole("button", { name: "Complete final account", exact: true }).click();
 await expect.poll(async () => (await read("shadow-demo")).account.lock?.finalAccountRevisionId).toBe(final.account.id);
 const locked = await read("shadow-demo"); expect(locked.account.lock.finalAccountRevisionId).toBe(final.account.id);
 // Step 6: the real worker reveals; the builder confirms and prices each item on screen.
 await page.goto(`/jobs/${jobId}#final-check`);
 const reveal0 = page.getByTestId("final-check-reveal");
 await expect(reveal0).toHaveAttribute("aria-busy", "false");
 const run = reveal0.getByRole("button", { name: "Run the final check (practice)", exact: true });
 if (await run.isVisible()) await run.click();
 await expect.poll(async () => (await read("final-check")).state, { timeout: 180_000 }).toBe("completed");
 await page.reload();
 const reveal = await read("final-check") as FinalCheckRead;
 expect(reveal.items.map(item => item.description).sort()).toEqual(["fitted garden drainage", "fitted loft hatch"]);
 const prices: Record<string, string> = { "fitted garden drainage": "500.00", "fitted loft hatch": "300.00" };
 for (const item of reveal.items) {
  const panel = page.getByTestId("final-check-reveal");
  await expect(panel).toHaveAttribute("aria-busy", "false");
  const request = page.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/final-check/catches"));
  await panel.locator("article").filter({ hasText: item.description }).getByRole("button", { name: "Yes — this was extra work", exact: true }).click();
  const command = (await request).postDataJSON();
  await expect.poll(async () => (await read("variations")).variations.some((v: { id: string }) => v.id === command.commandId)).toBe(true);
  const confirmed = await post("final-check/catches", command);
  expect(await post("final-check/catches", command)).toEqual(confirmed);
  const changed = await page.request.post(`/api/jobs/${jobId}/final-check/catches`, { data: { ...command, expectedSignalRevision: item.signalRevision + 1 } });
  expect(changed.ok()).toBe(false);
  const variation = (await read("variations")).variations.find((v: { id: string }) => v.id === command.commandId);
  expect(variation.state).toBe("draft"); expect(variation.currentRevisionId).toBeNull();
  // The saved job opens its work section at this variation.
  await page.goto(`/jobs/${jobId}#variation-${variation.id}`); await page.reload();
  const row = page.getByTestId(`variation-${variation.id}`);
  await row.getByRole("button", { name: "Change price", exact: true }).click();
  await row.getByLabel(`New price ${item.description}`).fill(prices[item.description]!);
  await row.getByRole("button", { name: "Save new proposed revision", exact: true }).click();
  await expect(row.getByRole("button", { name: "Approve exact revision", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#final-check`); await page.reload();
 }
 const variations = (await read("variations")).variations;
 const catches = variations.filter((v: { id: string }) => !new Set<string>([proposalId, reviewId]).has(v.id));
 expect(catches).toHaveLength(2);
 expect(catches.map((v: { revisions: { signedDeltaPence: number }[] }) => v.revisions.at(-1)!.signedDeltaPence).sort()).toEqual([30000, 50000]);
 expect(catches.every((v: { revisions: { approved: boolean }[] }) => v.revisions.every(r => !r.approved))).toBe(true);
 const after = await read("shadow-demo");
 expect(after.account.lock).toEqual(locked.account.lock);
 expect(after.account.account.id).toBe(final.account.id);
 expect(after.assessments).toEqual([]); // No assessment before settlement and allocation.
 expect(after.invoices.invoices).toEqual([]);
 expect(after.customerApproval).toEqual({ state: "awaiting_customer", approvals: [] }); expect(after.realExternalActions).toBe(0);
 // A fresh post-lock note is refused; exact earlier command can still replay.
 const late = await page.request.post(`/api/jobs/${jobId}/diary`, { data: { ...diary, commandId: randomUUID() } });
 expect(late.ok()).toBe(false); expect(await post("diary", diary)).toEqual(note);
 // Keep the unapproved checkpoint before continuing main's full paid journey.
 await page.goto(`/demo-s/shadow-30000?jobId=${jobId}`);
 await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 const unapproved = page.getByRole("region", { name: "Saved shadow journey report" });
 for (const text of ["£33,600.00 net", "Customer approval: Awaiting customer", "fitted garden drainage", "fitted loft hatch", "No invoice issued", "recovery fee £0"]) await expect(unapproved).toContainText(text);
 // Leg 6b: send the priced catches, then the customer signs in and approves
 // each exact revision in an isolated portal context. No builder attestation.
 await approveJ3Catches(page, browser, jobId, catches);
 const approvedReport = await read("shadow-demo");
 // Each catch's current revision was approved through the portal; keep its saved timestamp to compare later.
 const customerApprovals = approvedReport.customerApproval.approvals as { variationId: string; approvedAt: string; method: string }[];
 const approvedCustomerApproval = { state: "approved", approvals: customerApprovals };
 expect(approvedReport.version).toBe("shadow-demo-report.v2");
 expect(approvedReport.customerApproval.state).toBe("approved");
 expect(customerApprovals.map(row => row.variationId).sort()).toEqual(catches.map((row: { id: string }) => row.id).sort());
 expect(customerApprovals.every(row => row.method === "customer_portal")).toBe(true);
 // Approved but unbilled is honestly still incomplete on the saved report.
 expect(approvedReport.status).toBe("incomplete");
 await page.goto(`/demo-s/shadow-30000?jobId=${jobId}`);
 await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 await expect(page.getByRole("region", { name: "Saved shadow journey report" }).getByText("Incomplete. Step 6: approved by the customer. No fee is charged.", { exact: true })).toBeVisible();
 // Legs 7–9: one combined invoice, matched settled receipt, exact source-backed
 // allocations, SV-6 reviews, MON-4A statement and CH-8 offline-verified packs.
 const settled = await settleJ3(page, jobId, reveal.lockId!, catches, testInfo);
 const report = await read("shadow-demo");
 expect(report.customerApproval).toEqual(approvedCustomerApproval);
 expect(report.account.lock).toEqual(locked.account.lock);
 expect(report.account.account.id).toBe(settled.final.account.id);
 expect(report.account.captures.map((row: { id: string }) => row.id).sort()).toEqual(before.account.captures.map((row: { id: string }) => row.id).sort());
 expect(report.invoices.invoices).toEqual([expect.objectContaining({ id: settled.invoice.id, netPence: 3440000, totalPence: 4128000, balancePence: 0 })]);
 expect(report.finalCheck).toMatchObject({ state: "completed", lockId: reveal.lockId, runId: reveal.runId });
 expect(report.assessments.map((row: { assessment: { assessmentId: string } }) => row.assessment.assessmentId).sort()).toEqual(settled.assessments.map(row => row.assessment.assessmentId).sort());
 expect(report.packs.map((row: { caseId: string }) => row.caseId).sort()).toEqual(settled.packs.map(row => row.caseId).sort());
 for (const pack of settled.packs) {
  const saved = report.packs.find((row: { caseId: string }) => row.caseId === pack.caseId);
  // The report must contain the same persisted pack producer response, not a
  // hard-coded completion label or a pack borrowed from another case.
  expect(saved.result).toEqual(await jsonResult(page.request.get(`/api/recovery-cases/${pack.caseId}/evidence-packs?version=3`), "Read approved pack"));
  expect(JSON.stringify(saved.result)).toContain(pack.manifestHash);
 }
 // Exact v2 envelope and full producer values, including persisted portal approvals.
 const expectedPacks = await Promise.all(settled.packs.map(async pack => ({ caseId: pack.caseId,
  result: await jsonResult(page.request.get(`/api/recovery-cases/${pack.caseId}/evidence-packs?version=3`), "Read report pack producer") })));
 const byAssessment = (a: { assessment: { assessmentId: string } }, b: { assessment: { assessmentId: string } }) => a.assessment.assessmentId.localeCompare(b.assessment.assessmentId);
 const byCase = (a: { caseId: string }, b: { caseId: string }) => a.caseId.localeCompare(b.caseId);
 expect({ ...report, assessments: [...report.assessments].sort(byAssessment), packs: [...report.packs].sort(byCase) }).toEqual({
  version: "shadow-demo-report.v2", environment: "synthetic_demo", jobId, status: "complete", realExternalActions: 0,
  customerApproval: approvedCustomerApproval,
  account: await read("final-account/lock"), invoices: await read("customer-invoices"),
  value: await read("value/v3"), finalCheck: await read("final-check"),
  assessments: settled.assessments.map(row => ({ assessment: row.assessment, illustrationAsAssessed: row.valueReceipt })).sort(byAssessment),
  packs: expectedPacks.sort(byCase),
 });
 await page.goto(`/demo-s/shadow-30000?jobId=${jobId}`);
 await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 const saved = page.getByRole("region", { name: "Saved shadow journey report" });
 for (const text of ["£34,400.00", "£41,280.00", "£500.00", "£300.00", "fitted garden drainage", "fitted loft hatch", "recovery fee £0"]) await expect(saved).toContainText(text);
 await expect(saved.getByText("Complete. All nine steps are saved on this job.", { exact: true })).toBeVisible();
 const figures = saved.getByRole("definition");
 for (const text of ["£800.00", "£80.00", "£720.00", "£3,600.00 · fee £0.00"]) await expect(figures.getByText(text, { exact: true })).toBeVisible();
 await expect(saved).toContainText("Supporting evidence packs: approved packs are saved with records linked to each extra.");
 // Step 3: the photo and diary signals were received before lock; the supplier document is in each pack.
 expect(report.finalCheck.items.flatMap((item: { evidence: { source: string; evidenceAfterLock: boolean }[] }) => item.evidence).map((row: { source: string; evidenceAfterLock: boolean }) => [row.source, row.evidenceAfterLock]).sort()).toEqual([["electrical_certificate", false], ["job_diary_text", false]]);
 for (const pack of report.packs) expect(pack.result.packs[0].sources.some((source: { sourceId: string }) => source.sourceId.startsWith("supplier_document_version:"))).toBe(true);
 // Reload the report to prove the same persisted bindings survive navigation.
 await page.reload(); await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 await expect(saved).toContainText("£34,400.00");
 expect(await read("shadow-demo")).toEqual(report);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: testInfo.outputPath(`DEMO-J3-${testInfo.project.name}.png`), fullPage: true });
 return { jobId, report, customerApprovals };
}

// These are three assertion groups over the same persisted result. Run all nine
// journey steps once per viewport; neither read below changes the saved job.
test("DEMO-J3 fresh shadow-30000 completes customer approvals, one paid invoice, £800 Q and verified packs", async ({ page, browser }, testInfo) => {
 const { jobId, report, customerApprovals } = await test.step("Complete all nine fresh J3 journey steps", () => completeJ3(page, browser, testInfo));

 await test.step("J3-VALUE-COMBINED: value report retains £3,600 captures and £800/£80/£720 after the combined invoice", async () => {
 expect(report.value).toMatchObject({ version: "job-value.v3", jobId, status: "mapped", receipt: {
  tracked: { pence: 360000, currency: "GBP" }, trackedFee: { pence: 0, currency: "GBP" },
  found: { state: "mapped", recovered: { pence: 80000 }, fee: { pence: 8000 }, yoursBeforeVatAndTax: { pence: 72000 } },
 } });
 await page.goto(`/jobs/${jobId}/value`);
 for (const [id, amount] of [["found-recovered-net", "£800.00"], ["found-success-fee", "£80.00"], ["found-yours-before-tax", "£720.00"], ["tracked-captured-net", "£3,600.00"], ["tracked-fee", "£0.00"]]) await expect(page.getByTestId(id!)).toHaveText(amount!);
 });

 await test.step("DEMO-J3-APPROVAL-READ", async () => {
 const byVariation = (a: { variationId: string }, b: { variationId: string }) => a.variationId.localeCompare(b.variationId);
 expect({ ...report.customerApproval, approvals: [...report.customerApproval.approvals].sort(byVariation) }).toEqual({
  state: "approved", approvals: [...customerApprovals].sort(byVariation),
 });
 });
});
