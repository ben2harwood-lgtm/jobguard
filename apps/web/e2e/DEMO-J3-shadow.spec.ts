import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { openCapture, startWatchdogJob } from "./helpers/capture-journey";
import { jsonResult } from "./helpers/customer-invoice-journey";
import type { FinalCheckRead } from "../app/ui/final-check-reveal-view";
import { holdShadowRecipeSources } from "./helpers/shadow-source-recipe";
import { approveJ3Catches } from "./helpers/j3-customer-approval";
import { settleJ3 } from "./helpers/j3-settlement";
import { finishDispositionsAndTerms } from "./helpers/final-account-lock-journey";

// Fresh persisted DEMO-S steps 1–9, on both phone and desktop. No end-state seed.
async function completeJ3(page: Page, browser: Browser, testInfo: TestInfo) {
 test.setTimeout(720_000);
 await openCapture(page); await page.goto("/demo-s/shadow-30000");
 const create = page.getByRole("button", { name: "Create or recover the J3 capture" });
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
 const post = (path: string, data: unknown) => jsonResult(page.request.post(`/api/jobs/${jobId}/${path}`, { data }), path);
 const read = (path: string) => jsonResult(page.request.get(`/api/jobs/${jobId}/${path}`), path);
 const quote = await read("quotes"); expect(quote.revisions.at(-1).netPence).toBe(3000000);
 const proposalId = randomUUID();
 const proposed = await post("variations", { version: "variation-command.v1", action: "propose", proposalId, scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null,
  description: "Fictional builder logged extras", captureText: "Fictional builder logged extras", price: { quantity: "1", unit: "item", unitRatePence: 320000, direction: "addition" } });
 const approve = async (view: typeof proposed, id: string) => {
  const variation = view.variations.find((v: { id: string }) => v.id === id)!;
  return post("variations", { version: "variation-command.v1", action: "approve", variationId: id, revisionId: variation.currentRevisionId, approvalId: randomUUID(), attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
 };
 await approve(proposed, proposalId);
 // Use the established producer's requirement, finalized image and completion.
 await jsonResult(page.request.post("/api/decisions", { data: { version: "finding-evaluation-command.v1", commandId: randomUUID(), tenantId: "11111111-1111-4111-8111-111111111111", jobId } }), "Proof requirement");
 const proof = await read("proof");
 const selected = await post("proof", { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", scopeItemId: proof.scopeItemId, fixture: "j3-drainage-photo" });
 const finalized = await post("proof", { version: "practice-proof-command.v1", commandId: randomUUID(), action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId });
 await post("proof", { version: "practice-proof-command.v1", commandId: randomUUID(), action: "complete", evidenceId: finalized.upload.evidenceId, scopeItemId: proof.scopeItemId });
 // Three genuine source types, through existing product intake routes. The
 // material invoice is examined honestly as zero-result, not labelled extra work.
 const supplier = { version: "supplier-document-intake.v1", commandId: randomUUID(), fixtureId: "materials-320-invoice", channel: "picker", expectedRevision: 0 };
 await post("supplier-documents/intake", supplier);
 await post("supplier-documents/intake", supplier);
 const diary = { version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite: false, text: "Fictional practice diary: fitted loft hatch. Estimated extra: £300 net." };
 const note = await post("diary", diary);
 expect(await post("diary", diary)).toEqual(note);
 const conflict = await page.request.post(`/api/jobs/${jobId}/diary`, { data: { ...diary, text: "Different fictional work." } });
 expect(conflict.ok()).toBe(false);
 await post("final-account/terms", { version: "final-check-terms.accept.v1", commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
 const publicBefore = await read("shadow-demo");
 // Test-only queued-worker contexts use the same ESM module as the driver.
 const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
 const { verifiedTenantContextForQueuedJob } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
 await holdShadowRecipeSources(verifiedTenantContextForQueuedJob("11111111-1111-4111-8111-111111111111"), verifiedTenantContextForQueuedJob(randomUUID()), jobId);
 expect(await read("shadow-demo")).toEqual(publicBefore); // Holding/replaying signals cannot change a builder response.
 expect(await read("final-check")).toMatchObject({ state: "unlocked", items: [] });
 let final = await post("final-account", { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: 0 });
 expect(final.account.totals.net.pence).toBe(3320000);
 const reviewId = randomUUID();
 await post("final-account/review-extras", { version: "final-review-extra.v1", commandId: reviewId, scopeItemId: randomUUID(), description: "Fictional extra at final review", captureText: "Fictional extra at final review", price: { quantity: "1", unit: "item", unitRatePence: 40000, direction: "addition" } });
 await approve(await read("variations"), reviewId);
 final = await post("final-account", { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: final.account.revision });
 expect(final.account.totals.net.pence).toBe(3360000);
 const before = await read("shadow-demo"); expect(before.account.captures.map((c: { netPence: number }) => c.netPence).sort()).toEqual([320000, 40000]);
 expect(before).not.toHaveProperty("finalCheck"); expect(before).not.toHaveProperty("assessments");
 expect(before.version).toBe("shadow-demo-report.v2");
 expect(before.customerApproval).toEqual({ state: "not_ready_yet", approvals: [] }); expect(before.invoices.invoices).toEqual([]);
 await page.goto(`/jobs/${jobId}#final-account-title`); await finishDispositionsAndTerms(page);
 await page.getByRole("button", { name: "Complete final account", exact: true }).click();
 await expect.poll(async () => (await read("shadow-demo")).account.lock?.finalAccountRevisionId).toBe(final.account.id);
 const locked = await read("shadow-demo"); expect(locked.account.lock.finalAccountRevisionId).toBe(final.account.id);
 // Ask the actual scheduled practice worker to freeze, examine, reconcile and publish.
 const request = { version: "final-check-run.request.v1" };
 await post("final-check/runs", request); await post("final-check/runs", request);
 await expect.poll(async () => (await read("final-check")).state, { timeout: 180_000, intervals: [5000] }).toBe("completed");
 const reveal = await read("final-check") as FinalCheckRead;
 expect(reveal.items.map(item => item.description).sort()).toEqual(["fitted garden drainage", "fitted loft hatch"]);
 for (const item of reveal.items) {
  const command = { version: "final-check.catch.v1", commandId: randomUUID(), lockId: reveal.lockId!, runId: reveal.runId!, signalId: item.signalId, expectedSignalRevision: item.signalRevision };
  const confirmed = await post("final-check/catches", command);
  expect(await post("final-check/catches", command)).toEqual(confirmed);
  const changed = await page.request.post(`/api/jobs/${jobId}/final-check/catches`, { data: { ...command, expectedSignalRevision: item.signalRevision + 1 } });
  expect(changed.ok()).toBe(false);
  const variation = (await read("variations")).variations.find((v: { id: string }) => v.id === command.commandId);
  expect(variation.state).toBe("draft"); expect(variation.currentRevisionId).toBeNull();
  const price = item.description === "fitted garden drainage" ? 50000 : 30000;
  await post("variations", { version: "variation-command.v1", action: "revise", variationId: variation.id, revisionId: randomUUID(), expectedRevisionId: null,
   description: item.description, price: { quantity: "1", unit: "item", unitRatePence: price, direction: "addition" } });
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
 // Leg 6b: send the priced catches, then the customer signs in and approves
 // each exact revision in an isolated portal context. No builder attestation.
 await approveJ3Catches(page, browser, jobId, catches);
 const approvedReport = await read("shadow-demo");
 // Main's v2 reader has not yet bound portal provenance into this report.
 // Approval itself is proved through the customer UI and variation records;
 // preserve the exact current public envelope rather than inventing completion.
 expect(approvedReport.version).toBe("shadow-demo-report.v2");
 expect(approvedReport.customerApproval).toEqual({ state: "awaiting_customer", approvals: [] });
 // Legs 7–9: one combined invoice, matched settled receipt, exact source-backed
 // allocations, SV-6 reviews, MON-4A statement and CH-8 offline-verified packs.
 const settled = await settleJ3(page, jobId, reveal.lockId!, final.account.revision, catches, testInfo);
 const report = await read("shadow-demo");
 expect(report.customerApproval).toEqual({ state: "awaiting_customer", approvals: [] });
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
 // Exact v2 envelope and full producer values, including the currently held
 // portal-approval binding. Do not turn these into fabricated completion flags.
 const expectedPacks = await Promise.all(settled.packs.map(async pack => ({ caseId: pack.caseId,
  result: await jsonResult(page.request.get(`/api/recovery-cases/${pack.caseId}/evidence-packs?version=3`), "Read report pack producer") })));
 const byAssessment = (a: { assessment: { assessmentId: string } }, b: { assessment: { assessmentId: string } }) => a.assessment.assessmentId.localeCompare(b.assessment.assessmentId);
 const byCase = (a: { caseId: string }, b: { caseId: string }) => a.caseId.localeCompare(b.caseId);
 expect({ ...report, assessments: [...report.assessments].sort(byAssessment), packs: [...report.packs].sort(byCase) }).toEqual({
  version: "shadow-demo-report.v2", environment: "synthetic_demo", jobId, status: "incomplete", realExternalActions: 0,
  customerApproval: { state: "awaiting_customer", approvals: [] },
  account: await read("final-account/lock"), invoices: await read("customer-invoices"),
  value: await read("value/v3"), finalCheck: await read("final-check"),
  assessments: settled.assessments.map(row => ({ assessment: row.assessment, illustrationAsAssessed: row.valueReceipt })).sort(byAssessment),
  packs: expectedPacks.sort(byCase),
 });
 await page.goto(`/demo-s/shadow-30000?jobId=${jobId}`);
 await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 const saved = page.getByRole("region", { name: "Saved shadow journey report" });
 for (const text of ["£34,400.00", "£41,280.00", "£500.00", "£300.00", "fitted garden drainage", "fitted loft hatch", "recovery fee £0"]) await expect(saved).toContainText(text);
 // The reviewed UI still labels this report incomplete; the portal and pack
 // steps above remain active and must succeed independently of that wording.
 await expect(saved).toContainText("Incomplete. Customer approval is not ready yet (MON-5).");
 // Reload the report to prove the same persisted bindings survive navigation.
 await page.reload(); await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 await expect(saved).toContainText("£34,400.00");
 expect(await read("shadow-demo")).toEqual(report);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: testInfo.outputPath(`DEMO-J3-${testInfo.project.name}.png`), fullPage: true });
 return { jobId, report };
}

test("DEMO-J3 fresh shadow-30000 completes customer approvals, one paid invoice, £800 Q and verified packs", async ({ page, browser }, testInfo) => {
 await completeJ3(page, browser, testInfo);
});

// J3-VALUE-COMBINED is not on origin/main (8970e6e6): read_value_job still
// joins tracked captures to an invoice of the ORIGINAL locked revision. Keep
// only the combined-invoice value assertion fixme; all steps 6–9 above run.
// Remove fixme when J3-VALUE-COMBINED lands; this reruns the same fresh journey.
test.fixme("J3-VALUE-COMBINED: value report retains £3,600 captures and £800/£80/£720 after the combined invoice", async ({ page, browser }, testInfo) => {
 const { jobId, report } = await completeJ3(page, browser, testInfo);
 expect(report.value).toMatchObject({ version: "job-value.v3", jobId, status: "mapped", receipt: {
  tracked: { pence: 360000, currency: "GBP" }, trackedFee: { pence: 0, currency: "GBP" },
  found: { state: "mapped", recovered: { pence: 80000 }, fee: { pence: 8000 }, yoursBeforeVatAndTax: { pence: 72000 } },
 } });
 await page.goto(`/jobs/${jobId}/value`);
 for (const [id, amount] of [["found-recovered-net", "£800.00"], ["found-success-fee", "£80.00"], ["found-yours-before-tax", "£720.00"], ["tracked-captured-net", "£3,600.00"], ["tracked-fee", "£0.00"]]) await expect(page.getByTestId(id!)).toHaveText(amount!);
});
