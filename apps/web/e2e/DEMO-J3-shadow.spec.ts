import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { openCapture, startWatchdogJob } from "./helpers/capture-journey";
import { jsonResult } from "./helpers/customer-invoice-journey";
import type { FinalCheckRead } from "../app/ui/final-check-reveal-view";
import { holdShadowRecipeSources } from "./helpers/shadow-source-recipe";
import { finishDispositionsAndTerms } from "./helpers/final-account-lock-journey";

// Real persisted first half; no customer approval, paid invoice, Q or fee is
// manufactured to get past MON-5. Runs in both configured browser projects.
test("DEMO-J3 source recipe locks £33,600 and genuinely reveals £500 + £300 without customer approval", async ({ page }) => {
 test.setTimeout(300_000);
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
 expect(after.assessments).toEqual([]); // Q/£80/£720 remain targets until MON-5 and verified settlement.
 expect(after.invoices.invoices).toEqual([]);
 expect(after.customerApproval).toEqual({ state: "awaiting_customer", approvals: [] }); expect(after.realExternalActions).toBe(0);
 // A fresh post-lock note is refused; exact earlier command can still replay.
 const late = await page.request.post(`/api/jobs/${jobId}/diary`, { data: { ...diary, commandId: randomUUID() } });
 expect(late.ok()).toBe(false); expect(await post("diary", diary)).toEqual(note);
 await page.goto(`/demo-s/shadow-30000?jobId=${jobId}`);
 await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 const saved = page.getByRole("region", { name: "Saved shadow journey report" });
 await expect(saved).toContainText("£33,600.00 net"); await expect(saved).toContainText("Customer approval: Awaiting customer");
 await expect(saved).toContainText("fitted garden drainage"); await expect(saved).toContainText("fitted loft hatch");
 await expect(saved).toContainText("No invoice issued"); await expect(saved).toContainText("recovery fee £0");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
