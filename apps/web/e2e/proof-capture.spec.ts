import{expect,test}from"@playwright/test";
test("capture upload verify and gated completion have distinct states",async({page})=>{await page.goto("/");await page.getByRole("button",{name:"Start the demo"}).click();await page.getByRole("button",{name:"Skip tour"}).click();await page.getByRole("button",{name:"Add a photo"}).click();const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);await page.getByLabel("Choose site photo").setInputFiles({name:"runtime-proof.png",mimeType:"image/png",buffer:png});await expect(page.getByText(/Uploading|Uploaded/)).toBeVisible();await expect(page.getByText("Uploaded · awaiting server verification")).toBeVisible();await expect(page.getByText(/Proof complete/)).toHaveCount(0);await page.getByRole("button",{name:"Run synthetic server verification"}).click();await expect(page.getByText("Verified · exact object version stored")).toBeVisible();await page.getByRole("button",{name:"Complete stage"}).click();await expect(page.getByText("Proof complete · verified evidence linked")).toBeVisible()});
test("rejected upload never appears complete",async({page})=>{await page.goto("/");await page.getByRole("button",{name:"Start the demo"}).click();await page.getByRole("button",{name:"Skip tour"}).click();await page.getByRole("button",{name:"Add a photo"}).click();await page.getByLabel("Choose site photo").setInputFiles({name:"runtime.txt",mimeType:"text/plain",buffer:Buffer.from("synthetic")});await expect(page.getByText("Uploaded · awaiting server verification")).toBeVisible();await page.getByRole("button",{name:"Run synthetic server verification"}).click();await expect(page.getByText("Rejected · this file cannot complete proof")).toBeVisible();await expect(page.getByText(/Proof complete/)).toHaveCount(0)});


import { randomUUID } from "node:crypto";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { jsonResult } from "./helpers/customer-invoice-journey";

test("[MIGFIX-3.1/2/3] original-stage replacements repair the final-account gate and invalidation replays its first response", async ({ page }) => {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const path = `/api/jobs/${jobId}/proof`;
  const initial = await jsonResult(page.request.get(path), "Read original proof stage");
  const command = (data: Record<string, unknown>) => jsonResult(page.request.post(path, {
    data: { version: "practice-proof-command.v1", commandId: randomUUID(), ...data },
  }), "Execute proof command");
  let originalCompletion: string | undefined;
  for (let generation = 0; generation < 3; generation++) {
    const selected = await command({ action: "select_generated", scopeItemId: initial.scopeItemId, fixture: "completion-photo" });
    const finalized = await command({ action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId });
    const completed = await command({ action: "complete", scopeItemId: initial.scopeItemId, evidenceId: finalized.upload.evidenceId });
    originalCompletion ??= completed.completion.id;
    expect(completed.completion).toEqual({ id: originalCompletion, reviewRequired: false });
    const account = await jsonResult(page.request.post(`/api/jobs/${jobId}/final-account`, {
      data: { version: "final-account.assemble.v1", commandId: randomUUID() },
    }), "Assemble using current replacement proof");
    expect(account.account.issueBlocked).toBe(false);
    expect(account.account.proof).toEqual(expect.arrayContaining([expect.objectContaining({ evidenceId: finalized.upload.evidenceId })]));
    if (generation === 2) break;
    const invalidate = { action: "invalidate", commandId: randomUUID(), evidenceId: finalized.upload.evidenceId, reasonCode: "object_revoked" };
    const first = await command(invalidate);
    expect(first.completion.reviewRequired).toBe(true);
    expect(await command(invalidate)).toEqual(first);
    const blocked = await jsonResult(page.request.post(`/api/jobs/${jobId}/final-account`, {
      data: { version: "final-account.assemble.v1", commandId: randomUUID() },
    }), "Assemble with invalid proof");
    expect(blocked.account.issueBlocked).toBe(true);
  }
});
