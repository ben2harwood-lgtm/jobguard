import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { startWatchdogJob } from "./helpers/capture-journey";

// Explicit phone viewport, real controls and server persistence; no seeded catches or completion.
test.setTimeout(720_000);

async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}

const scenarios = [
  { note: "Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.", message: "Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.", description: "heated towel rail", estimate: 18000 },
  { note: "Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150", message: "Please paint the kitchen ceiling.", description: "kitchen ceiling", estimate: 15000 },
];
for (const scenario of [...scenarios.map(s=>({...s,paid:true})),{...scenarios[0]!,paid:false}]) test(`a found own-job extra appears with its proposed price and reaches a paid supplementary invoice: ${scenario.description}, main ${scenario.paid?"paid":"unpaid"}`, async ({ page, browser }, info) => {
  let jobId="";
  if (info.project.name === "mobile-360") await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();

    await click(page, "＋ Start a new job");
    await page.getByLabel("Work details").fill("Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.");
    await click(page,"Make my draft"); await click(page,"Check and edit my draft");
    await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();

    jobId = new URL(page.url()).pathname.split("/").at(-1)!;
    const quantities = page.getByRole("textbox", { name: /^Quantity /u });
    for (let i = 0; i < await quantities.count(); i++) await quantities.nth(i).fill("1");
    const units = page.getByRole("textbox", { name: /^Unit /u });
    for (let i = 0; i < await units.count(); i++) await units.nth(i).fill("item");
    const questions = page.getByRole("textbox", { name: /^Answer /u });
    for (let i = 0; i < await questions.count(); i++) await questions.nth(i).fill("Fictional decorating job, four days, £900 for the agreed work; builder removes waste.");
    await page.getByLabel("Customer name", { exact: true }).fill("Mr Example");
    await page.getByLabel("Premises address", { exact: true }).fill("9 Notreal Road");
    await page.getByLabel("Town", { exact: true }).fill("Exampleton");
    await page.getByLabel("UK postcode", { exact: true }).fill("SW1A 1AA");
    await click(page,"Save customer and site");
    await expect(page.getByTestId("party-customer")).toHaveText("Mr Example");
    await expect(page.getByTestId("party-site")).toHaveText("9 Notreal Road, Exampleton, SW1A 1AA");
    const parties = await page.request.get(`/api/jobs/${jobId}/parties`);
    expect(parties.ok()).toBe(true);
    expect((await parties.json()).current).toMatchObject({
      bindingId: expect.any(String), customer: { name: "Mr Example" },
      site: { addressLines: ["9 Notreal Road"], town: "Exampleton", postcode: "SW1A 1AA" },
    });
    const reviewLines = page.locator(".review-line");
    await expect(reviewLines.first()).toBeVisible();
    for (const line of await reviewLines.all()) {
      await line.getByRole("button", { name: /^Accept /u }).click();
      await expect(line.locator(".review-line-head strong")).toHaveText("accepted");
    }
    await click(page,"Confirm scope"); await click(page,"Price the work");
    const rates = page.getByRole("textbox", { name: /^Unit rate /u });
    await expect(rates.first()).toBeVisible();
    for (let i = 0; i < await rates.count(); i++) await rates.nth(i).fill(i === 0 ? "900.00" : "0.00");
    await startWatchdogJob(page);
    jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
    // Reopen the saved job so the site-work and Final Check panels load current state (as REAL-OWN-JOB-TO-PAID does).
    await page.goto(`/jobs/${jobId}#quote`);

    const messages = page.getByTestId("customer-messages");
    await messages.getByLabel("Made-up customer name").fill("Fictional Alex");
    await messages.getByLabel("Message", { exact: true }).fill(scenario.message);
    await messages.getByRole("button", { name: "Save message", exact: true }).click();
    await expect(messages.getByTestId("customer-message")).toContainText(scenario.message);
    const notes = page.getByTestId("job-diary");
    await notes.getByLabel("Note", { exact: true }).fill(scenario.note);
    await notes.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
    await page.reload();
    await expect(messages.getByTestId("customer-message")).toContainText(scenario.message);
    await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
    await expect(page.getByTestId("final-check-item")).toHaveCount(0);

    // Use the existing generated proof controls, without adding evidence fixtures.
    await click(page, "Attach generated practice image");
    await click(page, "Check file integrity");
    await click(page, "Complete this stage");
    await expect(page.getByTestId("stage-status")).toHaveText("Complete");
    await click(page, "Finished on site");
    await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
    await click(page, "Build final account");
    const panel = page.getByTestId("final-account-lock");
    await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
    const complete = panel.getByRole("button", { name: "Complete final account", exact: true });
    const dispositions = panel.getByRole("combobox");
    for (let index = 0; index < await dispositions.count(); index++) {
      await dispositions.nth(index).selectOption("done");
      await expect(panel).toHaveAttribute("aria-busy", "false");
    }
    const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
    if (await terms.isEnabled()) await terms.click();
    await expect(panel).toHaveAttribute("aria-busy", "false");
    // Known stale account state belongs to REAL-OWN-JOB-TO-PAID.
    if (!(await complete.isEnabled())) await click(page, "Rebuild from approved sources");
    await expect(complete).toBeEnabled(); await complete.click();
    await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
    await click(page, "Load the saved final check");
    const checkPanel = page.getByTestId("final-check-reveal");
    await expect(checkPanel).toHaveAttribute("aria-busy", "false");
    const initial = await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json();
    expect(initial.state).not.toBe("failed");
    if (initial.state !== "completed") await click(page, "Run the final check (practice)");
    await expect.poll(async () => {
      await click(page, "Load the saved final check");
      await expect(checkPanel).toHaveAttribute("aria-busy", "false");
      const saved = await (await page.request.get(`/api/jobs/${jobId}/final-check`)).json();
      expect(saved.state).not.toBe("failed");
      return saved.state;
    }, { timeout: 180_000, intervals: [1000, 3000, 5000] }).toBe("completed");
    // Reopen the saved job after persisted completion.
    await page.goto(`/jobs/${jobId}#quote`);
    await click(page, "Load the saved final check");
    await expect(page.getByTestId("final-check-status")).toContainText("found 1 thing");
    const items = page.getByTestId("final-check-item");
    await expect(items).toHaveCount(1);
    await expect(items).toContainText(scenario.description);
    await expect(items).not.toContainText("painted walls");
    // The real endpoint is the assertion boundary; no fabricated completion or
    // dependency on the separate screen-wording piece.
    const read = async () => {
      const response = await page.request.get(`/api/jobs/${jobId}/final-check`);
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const saved = await read();
    expect(saved.state).toBe("completed");
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ description: scenario.description, estimatedValuePence: scenario.estimate, variationId: null });
    expect(saved.items[0].evidence).toHaveLength(2);
    expect(saved.items[0].evidence.map((source: { source: string }) => source.source).sort()).toEqual(["customer_message_text", "job_diary_text"]);
    expect(new Set(saved.items[0].evidence.map((source: { id: string }) => source.id)).size).toBe(2);
    await page.reload();
    expect(await read()).toEqual(saved);
    await click(page, "Load the saved final check");
    const confirmation = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/final-check/catches`) && r.request().method() === "POST");
    await items.getByRole("button", { name: "Yes — this was extra work", exact: true }).click();
    const confirmedResponse = await confirmation;
    expect(confirmedResponse.ok(), `catch HTTP ${confirmedResponse.status()}`).toBe(true);
    // Take the new catch's identity from the saved variations; reading this page response body can hang.
    const created = (await (await page.request.get(`/api/jobs/${jobId}/variations`)).json()).variations;
    expect(created).toHaveLength(1);
    const confirmed = { variationId: created[0].id as string };
    const revealed = await read();
    expect(revealed.items).toHaveLength(1);
    expect(revealed.items[0]).toMatchObject({ signalId: saved.items[0].signalId, estimatedValuePence: scenario.estimate, disposition: "confirmed_extra", variationId: confirmed.variationId });
    const variations = await (await page.request.get(`/api/jobs/${jobId}/variations`)).json();
    expect(variations.variations).toHaveLength(1);
    expect(variations.variations[0]).toMatchObject({ id: confirmed.variationId, state: "draft", currentRevisionId: null, revisions: [] });

    const variationId=confirmed.variationId;
    const extra=page.getByTestId(`variation-${variationId}`);
    await expect(extra).toBeVisible();
    await expect(extra).toContainText("Proposed price from the evidence");
    await expect(extra).toContainText(`£${(scenario.estimate/100).toFixed(2)}`);
    await expect(extra.getByRole("button",{name:"Approve exact revision",exact:true})).toHaveCount(0);
    await page.reload();
    const editor=extra.getByRole("textbox",{name:`New price ${scenario.description}`,exact:true});
    await expect(editor).toHaveValue((scenario.estimate/100).toFixed(2));
    await editor.fill("175.00");
    // A successful unrelated save refreshes the mounted variation panel.
    await page.getByLabel("Variation price (£, optional)").fill("42.00");
    await click(page,"Load the saved final check");
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("job-saved",{detail:{jobId:location.pathname.split("/").at(-1)}})));
    await expect(editor).toHaveValue("175.00");
    await expect(page.getByLabel("Variation price (£, optional)")).toHaveValue("42.00");
    const invoices=async()=>{
      const response=await page.request.get(`/api/jobs/${jobId}/customer-invoices`);
      expect(response.ok()).toBe(true);return (await response.json()).invoices;
    };
    const account=async()=> (await (await page.request.get(`/api/jobs/${jobId}/final-account`)).json()).account;
    const locked=(await (await page.request.get(`/api/jobs/${jobId}/final-account/lock`)).json()).lock;
    const issueData=(a:{id:string;sourceHash:string})=>({version:"lock-bound-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:a.id,expectedSourceHash:a.sourceHash,invoiceKind:"supplementary",recipient:"practice-customer@example.invalid",issuedOn:"2026-11-14"});
    const supplement=page.getByRole("button",{name:"Issue supplementary invoice",exact:true});
    await expect(supplement).toBeDisabled();
    // Exercise the real route: the same code covers missing main and unchanged locked revision.
    const refused=await page.request.post(`/api/jobs/${jobId}/final-account/lock`,{data:issueData(await account())});
    expect(refused.ok()).toBe(false);expect((await refused.json()).code).toBe("SUPPLEMENTARY_INVOICE_BASE_REQUIRED");
    await info.attach("missing-main-route-refusal",{body:JSON.stringify({status:refused.status(),code:"SUPPLEMENTARY_INVOICE_BASE_REQUIRED"}),contentType:"application/json"});
    await click(page,"Issue final invoice");
    await expect(page.getByTestId("customer-invoice-number")).toHaveCount(1);
    const original=(await invoices())[0];
    const originalPanel=page.locator(`#invoice-${original.id}`);
    const pay=async(invoiceId:string,pence:number,reference:string)=>{
      const panel=page.locator(`#invoice-${invoiceId}`);
      await panel.getByTestId("uiwire12-receipt-amount").fill((pence/100).toFixed(2));
      await panel.getByTestId("uiwire12-receipt-reference").fill(reference);
      await panel.getByRole("button",{name:"Record practice receipt",exact:true}).click();
      await expect(panel.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
    };
    if(scenario.paid)await pay(original.id,original.totalPence,"Fictional original payment");
    const originalSaved=(await invoices())[0];
    const receiptsURL=`/api/jobs/${jobId}/customer-invoices/${original.id}/receipts`;
    const originalReceipts=await (await page.request.get(receiptsURL)).json();
    const unchanged=await page.request.post(`/api/jobs/${jobId}/final-account/lock`,{data:issueData(await account())});
    expect(unchanged.ok()).toBe(false);expect((await unchanged.json()).code).toBe("SUPPLEMENTARY_INVOICE_BASE_REQUIRED");
    await info.attach("unchanged-locked-revision-route-refusal",{body:JSON.stringify({status:unchanged.status(),code:"SUPPLEMENTARY_INVOICE_BASE_REQUIRED"}),contentType:"application/json"});
    await expect(supplement).toBeDisabled();
    await expect(page.getByTestId("lock-bound-invoices")).toContainText("still the locked account");
    await editor.fill((scenario.estimate/100).toFixed(2));
    await extra.getByRole("button",{name:"Save new proposed revision",exact:true}).click();
    await expect(extra.getByRole("button",{name:"Approve exact revision",exact:true})).toBeVisible();
    await expect(supplement).toBeDisabled();
    await extra.getByRole("button",{name:"Approve exact revision",exact:true}).click();
    await expect(extra).toContainText("Approved immutable commercial fact");
    await expect(supplement).toBeDisabled();
    const rebuild=page.waitForResponse(r=>r.url().endsWith(`/api/jobs/${jobId}/final-account`)&&r.request().method()==="POST");
    await click(page,"Rebuild from approved sources");
    const built=await rebuild;expect(built.ok(),await built.text()).toBe(true);
    const descendant=await account();expect(descendant.id).not.toBe(locked.finalAccountRevisionId);
    expect(descendant.lines.filter((l:{kind:string})=>l.kind==="variation")).toHaveLength(1);
    expect(descendant.lines.find((l:{kind:string})=>l.kind==="variation").netPence).toBe(scenario.estimate);
    const stale=await page.request.post(`/api/jobs/${jobId}/final-account/lock`,{data:{...issueData(descendant),expectedSourceHash:"f".repeat(64)}});
    expect(stale.ok()).toBe(false);expect((await stale.json()).code).toBe("STALE_REVISION");
    expect(await invoices()).toHaveLength(1);
    const issuing=page.waitForResponse(r=>r.url().endsWith(`/api/jobs/${jobId}/final-account/lock`)&&r.request().method()==="POST");
    await click(page,"Issue supplementary invoice");const issued=await issuing;expect(issued.ok(),await issued.text()).toBe(true);
    expect(issued.request().postDataJSON()).toMatchObject({finalAccountRevisionId:descendant.id,expectedSourceHash:descendant.sourceHash,invoiceKind:"supplementary"});
    const replay=await page.request.post(issued.url(),{data:issued.request().postDataJSON()});expect(replay.ok()).toBe(true);
    const history=await invoices();expect(history).toHaveLength(2);
    const supplementary=history.find((i:{id:string})=>i.id!==original.id);
    expect(supplementary.netPence).toBe(scenario.estimate);expect(supplementary.totalPence).toBe(scenario.estimate===18000?21600:18000);
    expect(history.find((i:{id:string})=>i.id===original.id)).toEqual(originalSaved);
    await expect(originalPanel.getByTestId("invoice-balance")).toHaveText(scenario.paid?"GBP 0.00":"GBP 1,080.00");
    await pay(supplementary.id,supplementary.totalPence,"Fictional catch payment");
    await page.reload();
    await expect(page.locator(`#invoice-${supplementary.id}`).getByTestId("invoice-balance")).toHaveText("GBP 0.00");
    expect(await (await page.request.get(receiptsURL)).json()).toEqual(originalReceipts);
    expect(await invoices()).toHaveLength(2);await expect(supplement).toBeDisabled();
    const foreign=await browser.newContext();try{
      const response=await foreign.request.get(`/api/jobs/${jobId}/final-check`);expect(response.ok()).toBe(false);
      const issue=await foreign.request.post(`/api/jobs/${jobId}/final-account/lock`,{data:issueData(descendant)});expect(issue.ok()).toBe(false);
    }finally{await foreign.close();}
    const admin=new Pool({connectionString:E2E_ADMIN_DATABASE_URL,max:1});try{
      const lines=await admin.query("SELECT line_kind,net_pence FROM app.final_account_invoiced_line WHERE job_id=$1 AND invoice_id=$2",[jobId,supplementary.id]);
      expect(lines.rows).toHaveLength(1);expect(lines.rows[0].line_kind).toBe("variation");expect(Number(lines.rows[0].net_pence)).toBe(scenario.estimate);
      const bindings=await admin.query("SELECT invoice_kind FROM app.final_account_invoice_binding WHERE job_id=$1 ORDER BY invoice_kind",[jobId]);
      expect(bindings.rows.map(r=>r.invoice_kind)).toEqual(["final","supplementary"]);
    }finally{await admin.end();}
});
