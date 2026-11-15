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
  { name: "ordinary towel-rail words persist one possible extra with both sources and exact proposed pence", note: "Customer asked for an extra heated towel rail while we were on site. Agreed 180 pounds. Fitted it today.", message: "Hi, yes please go ahead and fit the heated towel rail as well. 180 pounds is fine. Thanks.", description: "heated towel rail", estimate: "18000", found: true },
  { name: "ceiling extra and generated certificate reach the completed permitted result", note: "Painted the kitchen ceiling as an extra, customer asked for it. Estimated extra: £150", message: "Please paint the kitchen ceiling.", description: "kitchen ceiling", estimate: "15000", found: true },
];
test("ordinary towel-rail words persist one possible extra with both sources and exact proposed pence; ceiling certificate stays non-commercial", async ({ page }, info) => {
  if (info.project.name === "mobile-360") await page.setViewportSize({width:390,height:844});
  let firmTenantId: string | undefined;
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  for (const [index,scenario] of scenarios.entries()) {
    if (index > 0) await page.goto("/classic");
    await click(page, "＋ Start a new job");
    await page.getByLabel("Work details").fill("JOB: Fictional blue room\nITEM: Paint walls | £200.00");
    await click(page, "Make my draft");
    await click(page, "Check and edit my draft");
    await click(page, "Save customer and site");
    // Wait for the saved party binding before scope confirmation advances the job revision.
    await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
    await expect(page.getByTestId("party-site")).toHaveText("14 Fictional Street, London, SW1A 1AA");
    await expect(page.getByRole("form", { name: "Customer and site details" }).getByText(/^Saved at /u)).toBeVisible();
    await click(page, "Accept Paint walls");
    await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
    await click(page, "Confirm scope");
    await click(page, "Price the work");
    await startWatchdogJob(page);
    const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
    // Reopen the saved job so the site-work and Final Check panels load current state (as REAL-OWN-JOB-TO-PAID does).
    await page.goto(`/jobs/${jobId}#quote`);

    const messages = page.getByTestId("customer-messages");
    await messages.getByLabel("Made-up customer name").fill("Fictional Alex");
    await messages.getByLabel("Message", { exact: true }).fill(scenario.message);
    await messages.getByRole("button", { name: "Save message", exact: true }).click();
    await expect(messages.getByTestId("customer-message")).toContainText(scenario.message);
    const notes = page.getByTestId("job-diary");
    if (scenario.note !== null) {
      await notes.getByLabel("Note", { exact: true }).fill(scenario.note);
      await notes.getByRole("button", { name: "Save note", exact: true }).click();
      await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
    }
    await page.reload();
    await expect(messages.getByTestId("customer-message")).toContainText(scenario.message);
    if (scenario.note !== null) await expect(notes.getByTestId("diary-entry")).toContainText(scenario.note);
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
    // Reload the saved job after persisted completion to refresh the existing invoice guard.
    await page.goto(`/jobs/${jobId}#quote`);
    await click(page, "Load the saved final check");
    await expect(page.getByTestId("final-check-status")).toContainText(scenario.found ? "found 1 thing" : "found nothing missing");
    const items = page.getByTestId("final-check-item");
    await expect(items).toHaveCount(scenario.found ? 1 : 0);
    if (scenario.found) {
      await expect(items).toContainText(scenario.description);
      await expect(items).not.toContainText("painted walls");
      // Test-only administrative inspection: the reveal screen's pounds are owned
      // by the saved-estimate successor, not asserted as implemented here.
      const admin = new Pool({connectionString:E2E_ADMIN_DATABASE_URL,max:1});
      try {
        const client = await admin.connect();
        try {
          const tenantId = (await client.query("SELECT tenant_id FROM app.job WHERE id=$1",[jobId])).rows[0].tenant_id;
          if (firmTenantId === undefined) firmTenantId = tenantId;
          else expect(tenantId).toBe(firmTenantId);
          await client.query("BEGIN");
          await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
          const signals = (await client.query("SELECT id,description,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND coalesced_into_signal_id IS NULL",[tenantId,jobId])).rows;
          expect(signals).toHaveLength(1);
          expect(signals[0]).toMatchObject({description:scenario.description,estimated_value_pence:scenario.estimate});
          const sources=(await client.query("SELECT o.bytes FROM app.job_source_original o JOIN app.shadow_signal_evidence e ON (e.tenant_id,e.job_id,e.evidence_id)=(o.tenant_id,o.job_id,o.evidence_id) WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.signal_id=$3",[tenantId,jobId,signals[0].id])).rows;
          expect(sources.map(row=>row.bytes.toString("utf8")).sort()).toEqual([scenario.note,scenario.message].sort());
          await client.query("ROLLBACK");
        } finally {client.release();}
      } finally {await admin.end();}
      await expect(items.getByRole("listitem")).toHaveCount(scenario.note === null ? 1 : 2);
    }
    const issued = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/customer-invoices`) && r.request().method() === "POST");
    await click(page, "Issue and simulate this invoice");
    const response = await issued;
    expect(response.ok(), await response.text()).toBe(true);
    const balance = await page.getByTestId("invoice-balance").textContent();
    expect(balance).toBe("GBP 240.00");
    await test.info().attach("displayed-outstanding-balance", { body: JSON.stringify({ jobId, viewport: page.viewportSize(), balance }), contentType: "application/json" });
    await page.getByTestId("uiwire12-receipt-amount").fill(balance!.replace("GBP ", ""));
    await page.getByTestId("uiwire12-receipt-reference").fill("Fictional typed-source receipt");
    await click(page, "Record practice receipt");
    await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
    await expect(page.getByTestId("customer-payment-status")).toHaveText("Paid");
    await page.reload();
    await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
    await expect(page.getByTestId("customer-payment-status")).toHaveText("Paid");
    const invoices = await page.request.get(`/api/jobs/${jobId}/customer-invoices`);
    expect(invoices.ok()).toBe(true);
    expect((await invoices.json()).invoices).toHaveLength(1);
  }
});
