import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";

// Both configured projects run this UI-only setup. The database connection below
// only records diagnostics: it never creates jobs, signals or completion facts.
for (const electrical of [false,true]) test(electrical ? "REAL-GAP-PROOF-BY-TRADE: explicit Yes finishes with a certificate" : "REAL-GAP-PROOF-BY-TRADE: a decorating job finishes with a completion photo", async ({ page, browser }) => {
  if(test.info().project.name.includes("mobile")) await page.setViewportSize({width:390,height:844});
  test.setTimeout(360_000);
  const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  let jobId = "";
  const invoiceResponses: unknown[] = [];
  page.on("response", async response => {
    if (response.request().method() === "POST" && response.url().endsWith("/customer-invoices")) {
      invoiceResponses.push({ status: response.status(), request: response.request().postDataJSON(), body: await response.json() });
    }
  });
  const click = async (name: string) => {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled(); await button.click();
  };
  const account = async () => {
    const response = await page.request.get(`/api/jobs/${jobId}/final-account`);
    expect(response.ok()).toBe(true); return (await response.json()).account;
  };
  const issueBody = (a: { id: string; sourceHash: string }) => ({
    version: "practice-customer-invoice.issue.v1", commandId: crypto.randomUUID(), finalAccountRevisionId: a.id,
    expectedSourceHash: a.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-11-09",
  });
  const rebuild = async () => {
    const response = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/final-account`) && r.request().method() === "POST");
    await click("Rebuild from approved sources");
    const saved = await response; expect(saved.ok(), await saved.text()).toBe(true);
    await expect(page.getByTestId("final-account-lock")).toBeVisible();
  };
  try {
    await page.goto("/practice-company");
    await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    await click("＋ Start a new job");
    await page.getByLabel("Work details").fill(`JOB: Practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves`);
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
    await click("Preview immutable quote"); await click("Simulate sending this quote");
    await click("Continue fake worker");
    await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
    await click("Record practice acceptance"); await click("Start this practice job");
    await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
    // Reopen the saved job to load the site-work and Final Check panels, rather
    // than borrowing the walkthrough's prepared example or injecting local state.
    await page.goto(`/jobs/${jobId}#quote`);
    await click("Finished on site");
    await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
    await click("Build final account");
    await expect(page.getByTestId("lock-state")).toHaveText("Final account review");
    const beforeProof = await account(); expect(beforeProof.issueBlocked).toBe(true);
    await expect(page.getByRole("button",{name:"Attach generated practice image",exact:true})).toBeEnabled();
    const proofPanel=page.locator("#work-proof");
    await expect(proofPanel.getByRole("button",{name:"Yes",exact:true})).toHaveAttribute("aria-pressed","false");
    await expect(proofPanel.getByRole("button",{name:"No",exact:true})).toHaveAttribute("aria-pressed","false");
    // Fault injection aborts only the answer request; no successful server state is fabricated.
    await page.route(`**/api/jobs/${jobId}/proof`,route=>route.request().method()==="POST"?route.abort():route.continue());
    await proofPanel.getByRole("button",{name:electrical?"Yes":"No",exact:true}).click();
    await expect(page.getByRole("alert").filter({hasText:"Your answer was not saved. Try again."})).toBeVisible();
    await expect(page.getByTestId("proof-statement")).toHaveCount(0);
    await page.unroute(`**/api/jobs/${jobId}/proof`);
    await proofPanel.getByRole("button",{name:electrical?"Yes":"No",exact:true}).click();
    await expect(page.getByTestId("proof-statement")).toContainText(electrical?"Yes":"No");
    await expect(page.getByText(electrical?"Practice example: an electrical certificate":"Practice example: a completion photo",{exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("proof-statement")).toContainText(electrical?"Yes":"No");
    if(test.info().project.name.includes("mobile")) {
      await page.setViewportSize({width:390,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    }
    await click("Attach generated practice image"); await click("Check file integrity"); await click("Complete this stage");
    await expect(page.getByTestId("stage-status")).toHaveText("Complete");
    const panel = page.getByTestId("final-account-lock");
    await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
    const dispositions = panel.getByRole("combobox");
    await expect(dispositions).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await dispositions.nth(i).selectOption("done"); await expect(panel).toHaveAttribute("aria-busy", "false");
    }
    const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
    if (await terms.isEnabled()) await terms.click();
    await expect(panel.getByText("Final check terms accepted.", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Complete final account", exact: true })).toBeDisabled();
    // Regression: the old screen silently left this button grey after proof.
    await expect(panel.getByText(/press “Rebuild from approved sources” to include the saved proof/u)).toBeVisible();
    await rebuild();
    const current = await account(); expect(current.issueBlocked).toBe(false);
    expect(current.proofStatement.includesElectricalWork).toBe(electrical);
    expect(current.proof.map((p:{evidenceType:string})=>p.evidenceType)).toEqual([electrical?"electrical_certificate":"completion_photo"]);
    await expect(page.getByRole("region",{name:"Builder’s statement"})).toContainText("Server time");
    const command = issueBody(current);
    const unlocked = await page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: command });
    expect(unlocked.status()).toBe(409); expect((await unlocked.json()).code).toBe("FINAL_ACCOUNT_LOCK_REQUIRED");
    await click("Complete final account");
    await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
    const locked = (await (await page.request.get(`/api/jobs/${jobId}/final-account/lock`)).json()).lock;
    // A second identical rebuild must reuse the head, never replace the locked bill.
    await rebuild();
    expect(await account()).toEqual(current);
    await click("Load the saved final check");
    const checkPanel = page.getByTestId("final-check-reveal");
    await expect(checkPanel).toHaveAttribute("aria-busy", "false");
    const readCheck = async () => {
      await click("Load the saved final check");
      await expect(checkPanel).toHaveAttribute("aria-busy", "false");
      return (await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json()).state as string;
    };
    const initialCheckState = await readCheck();
    expect(initialCheckState, "Failed source processing must stop this journey; see source-diagnostics").not.toBe("failed");
    if (initialCheckState !== "completed") {
      await click("Run the final check (practice)");
      // Stop at failed; the finally block records source kind/status/failure code.
      await expect.poll(readCheck, { timeout: 180_000, intervals: [3000] }).not.toBe("pending");
    }
    const check = await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json();
    expect(check.state, "Final Check must process every source; inspect source-diagnostics attachment on failure").toBe("completed");
    await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check found nothing missing from your bill.");
    const changed = await page.request.post(`/api/jobs/${jobId}/final-account/review-extras`, { data: {
      version: "final-review-extra.v1", commandId: crypto.randomUUID(), scopeItemId: crypto.randomUUID(), description: "Too late", captureText: "Too late", price: null,
    } });
    expect(changed.ok()).toBe(false); expect((await changed.json()).code).toBe("FINAL_REVIEW_CLOSED");
    const stale = await page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: { ...command, expectedSourceHash: "0".repeat(64) } });
    expect(stale.status()).toBe(409); expect((await stale.json()).code).toBe("STALE_FINAL_ACCOUNT_AUTHORIZATION");
    const foreign = await browser.newContext();
    try {
      const visitor = await foreign.newPage(); await visitor.goto("/practice-company");
      await expect(visitor.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
      const refused = await visitor.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: command });
      expect(refused.status()).toBe(404); expect((await refused.json()).code).toBe("NOT_FOUND");
    } finally { await foreign.close(); }
    const issuedResponse = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/customer-invoices`) && r.request().method() === "POST");
    await click("Issue and simulate this invoice");
    const issuedHttp = await issuedResponse;
    expect(issuedHttp.status(), await issuedHttp.text()).toBe(200);
    await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,080.00");
    const issuedRequest = { status: issuedHttp.status(), request: issuedHttp.request().postDataJSON() as Record<string, unknown> };
    expect(issuedRequest.status).toBe(200);
    const replay = await page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: issuedRequest.request });
    expect(replay.ok()).toBe(true); expect((await replay.json()).invoices).toHaveLength(1);
    const duplicate = await page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: { ...issuedRequest.request, commandId: crypto.randomUUID() } });
    expect(duplicate.status()).toBe(409); expect((await duplicate.json()).code).toBe("FINAL_INVOICE_ALREADY_ISSUED");
    const changedReplay = await page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: { ...issuedRequest.request, issuedOn: "2026-11-08" } });
    expect(changedReplay.ok()).toBe(false); expect((await changedReplay.json()).code).toBe("IDEMPOTENCY_PAYLOAD_CONFLICT");
    expect((await (await page.request.get(`/api/jobs/${jobId}/final-account/lock`)).json()).lock).toEqual(locked);
    await page.getByTestId("uiwire12-receipt-amount").fill("1080.00");
    await page.getByTestId("uiwire12-receipt-reference").fill("Fictional own-job payment");
    await click("Record practice receipt");
    await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
    await page.goto(`/jobs/${jobId}/value`);
    await expect(page.getByTestId("value-invoiced-gross")).toHaveText("£1,080.00");
    await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,080.00");
    await expect(page.getByTestId("value-outstanding-gross")).toHaveText("£0.00");
  } finally {
    if (jobId) {
      const comparisons = await admin.query(`SELECT r.id revision_id,r.revision,r.source_hash,d.current_revision_id head_id,d.revision head_revision
        FROM app.final_account_revision r JOIN app.final_account_draft d ON(d.tenant_id,d.id)=(r.tenant_id,r.final_account_draft_id)
        WHERE r.job_id=$1 ORDER BY r.revision`, [jobId]);
      const sources = await admin.query(`SELECT s.source_kind,a.status,a.failure_code FROM app.final_check_processing_source s
        LEFT JOIN app.final_check_source_attempt a ON(a.tenant_id,a.job_id,a.manifest_id,a.source_id)=(s.tenant_id,s.job_id,s.manifest_id,s.id)
        WHERE s.job_id=$1 ORDER BY s.source_kind,a.sequence`, [jobId]);
      await test.info().attach("source-diagnostics", { contentType: "application/json", body: JSON.stringify({ jobId, invoiceResponses, comparisons: comparisons.rows, sources: sources.rows }, null, 2) });
    }
    await admin.end();
  }
});


test("prepared unanswered example retains the certificate walkthrough and resumes", async ({page}) => {
 if(test.info().project.name.includes("mobile")) await page.setViewportSize({width:390,height:844});
 test.setTimeout(360_000);
 await page.goto("/practice-company/walkthrough");
 const tour=page.getByRole("region",{name:"Guided walkthrough"});
 for(let step=1;step<=4;step++) {
  await expect(tour).toContainText(`Step ${step} of 9`,{timeout:60_000});
  if(step===3) await page.getByRole("button",{name:"Use the prepared example job",exact:true}).click();
  await tour.getByRole("button",{name:"Show me",exact:true}).click();
 }
 await expect(tour).toContainText("Step 5 of 9");
 // Use the saved walkthrough, with no inferred answer from its prepared title or images.
 const proof=page.locator("#work-proof");
 await expect(proof).toBeVisible();
 await expect(proof.getByText("Practice example: an electrical certificate",{exact:true})).toBeVisible();
 await expect(proof.getByRole("button",{name:"Yes",exact:true})).toHaveAttribute("aria-pressed","false");
 await expect(proof.getByRole("button",{name:"No",exact:true})).toHaveAttribute("aria-pressed","false");
 await expect(proof.getByRole("button",{name:"Attach generated practice image",exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.reload();
 await expect(proof.getByText("Practice example: an electrical certificate",{exact:true})).toBeVisible();
});
