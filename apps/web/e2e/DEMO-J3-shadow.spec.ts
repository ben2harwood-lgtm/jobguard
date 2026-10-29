import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { openCapture, startWatchdogJob } from "./helpers/capture-journey";
import { jsonResult } from "./helpers/customer-invoice-journey";
import { finishDispositionsAndTerms } from "./helpers/final-account-lock-journey";

// Real persisted first half; no customer approval, paid invoice, Q or fee is
// manufactured to get past MON-5. Runs in both configured browser projects.
test("DEMO-J3 creates and replays its real capture, builds £33,600 and locks the same job", async ({ page }) => {
 test.setTimeout(180_000);
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
 const selected = await post("proof", { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", scopeItemId: proof.scopeItemId, fixture: "completion-photo" });
 const finalized = await post("proof", { version: "practice-proof-command.v1", commandId: randomUUID(), action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId });
 await post("proof", { version: "practice-proof-command.v1", commandId: randomUUID(), action: "complete", evidenceId: finalized.upload.evidenceId, scopeItemId: proof.scopeItemId });
 let final = await post("final-account", { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: 0 });
 expect(final.account.totals.net.pence).toBe(3320000);
 const reviewId = randomUUID();
 await post("final-account/review-extras", { version: "final-review-extra.v1", commandId: reviewId, scopeItemId: randomUUID(), description: "Fictional extra at final review", captureText: "Fictional extra at final review", price: { quantity: "1", unit: "item", unitRatePence: 40000, direction: "addition" } });
 await approve(await read("variations"), reviewId);
 final = await post("final-account", { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: final.account.revision });
 expect(final.account.totals.net.pence).toBe(3360000);
 const before = await read("shadow-demo"); expect(before.account.captures.map((c: { netPence: number }) => c.netPence).sort()).toEqual([320000, 40000]);
 expect(before).not.toHaveProperty("finalCheck"); expect(before).not.toHaveProperty("assessments");
 expect(before.customerApproval).toBe("not_ready_yet"); expect(before.invoices.invoices).toEqual([]);
 await page.goto(`/jobs/${jobId}#final-account-title`); await finishDispositionsAndTerms(page);
 await page.getByRole("button", { name: "Complete final account", exact: true }).click();
 await expect.poll(async () => (await read("shadow-demo")).account.lock?.finalAccountRevisionId).toBe(final.account.id);
 const locked = await read("shadow-demo"); expect(locked.account.lock.finalAccountRevisionId).toBe(final.account.id);
 await page.goto(`/demo-s/shadow-30000?jobId=${jobId}`);
 await page.getByRole("button", { name: "Load saved J3 evidence" }).click();
 const saved = page.getByRole("region", { name: "Saved shadow journey report" });
 await expect(saved).toContainText("£33,600.00 net"); await expect(saved).toContainText("MON-5");
 await expect(saved).toContainText("No invoice issued"); await expect(saved).toContainText("recovery fee £0");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
