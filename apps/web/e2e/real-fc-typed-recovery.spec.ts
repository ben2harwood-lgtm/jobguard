import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL } from "./global-setup";
import { startWatchdogJob } from "./helpers/capture-journey";

test("ordinary typed job retains its bill through bounded worker recovery", async ({ page }) => {
  test.setTimeout(420000);
  const admin = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  const fault = `e2e_recovery_${randomUUID().replaceAll("-", "")}`;
  let jobId = "", installed = false;
  const click = async (name: string) => { const button = page.getByRole("button", { name, exact: true }); await expect(button).toBeEnabled(); await button.click(); };
  const savedCheck = async () => { const response = await page.request.get(`/api/jobs/${jobId}/final-check`); expect(response.ok()).toBe(true); return response.json(); };
  const requestRow = async () => (await admin.query("SELECT * FROM infrastructure.final_check_request WHERE job_id=$1 ORDER BY attempt DESC LIMIT 1", [jobId])).rows[0];
  const removeFault = async () => {
    if (!installed) return;
    await admin.query(`DROP TRIGGER "${fault}" ON app.final_check_source_attempt; DROP FUNCTION public."${fault}"()`);
    installed = false;
  };
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
    await click("＋ Start a new job");
    await page.getByLabel("Work details").fill("Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.");
    await click("Make my draft"); await click("Check and edit my draft");
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
    await click("Save customer and site");
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
    await click("Confirm scope"); await click("Price the work");
    const rates = page.getByRole("textbox", { name: /^Unit rate /u });
    await expect(rates.first()).toBeVisible();
    for (let i = 0; i < await rates.count(); i++) await rates.nth(i).fill(i === 0 ? "900.00" : "0.00");
    await startWatchdogJob(page);
    await page.goto(`/jobs/${jobId}#quote`);
    const messages = page.getByTestId("customer-messages");
    await messages.getByLabel("Made-up customer name").fill("Mr Example");
    await messages.getByLabel("Message", { exact: true }).fill("Please paint the hallway ceiling as an extra.");
    await messages.getByRole("button", { name: "Save message", exact: true }).click();
    await expect(messages.getByTestId("customer-message")).toContainText("Please paint the hallway ceiling as an extra.");
    const diary = page.getByTestId("job-diary");
    await diary.getByLabel("Note", { exact: true }).fill("also painted the hallway ceiling, customer asked. Estimated extra 150 pounds.");
    await diary.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(diary.getByTestId("diary-entry")).toContainText("Estimated extra 150 pounds.");
    await expect(page.getByTestId("final-check-item")).toHaveCount(0);
    await click("Attach generated practice image"); await click("Check file integrity"); await click("Complete this stage");
    await expect(page.getByTestId("stage-status")).toHaveText("Complete");
    await click("Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
    await click("Build final account");
    const panel = page.getByTestId("final-account-lock");
    await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
    const dispositions = panel.getByRole("combobox");
    for (let i = 0; i < await dispositions.count(); i++) { await dispositions.nth(i).selectOption("done"); await expect(panel).toHaveAttribute("aria-busy", "false"); }
    const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
    if (await terms.isEnabled()) await terms.click();
    await expect(panel).toHaveAttribute("aria-busy", "false");
    const complete = panel.getByRole("button", { name: "Complete final account", exact: true });
    if (!(await complete.isEnabled())) await click("Rebuild from approved sources");
    // Isolated DB-only transient fault. It affects this job's processing writes;
    // originals, detections and completion facts are neither changed nor seeded.
    await admin.query(`CREATE FUNCTION public."${fault}"() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN IF NEW.job_id='${jobId}'::uuid THEN RAISE EXCEPTION 'isolated transient recovery fault'; END IF; RETURN NEW; END $body$;
      CREATE TRIGGER "${fault}" BEFORE INSERT ON app.final_check_source_attempt FOR EACH ROW EXECUTE FUNCTION public."${fault}"()`);
    installed = true;
    await expect(complete).toBeEnabled(); await complete.click();
    await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
    const lock = (await (await page.request.get(`/api/jobs/${jobId}/final-account/lock`)).json()).lock;
    await expect.poll(async () => (await savedCheck()).state, { timeout: 180000, intervals: [1000, 3000] }).toBe("failed");
    const failed = await requestRow(); expect(failed.executions).toBe(3);
    const frozen = (await admin.query("SELECT id,lock_id,manifest_hash,evidence_cutoff_at,attempt FROM app.final_check_manifest WHERE id=$1", [failed.manifest_id])).rows;
    const inventory = (await admin.query("SELECT id,input_hash FROM app.final_check_processing_source WHERE manifest_id=$1 ORDER BY id", [failed.manifest_id])).rows;
    await click("Load the saved final check");
    await expect(page.getByTestId("final-check-status")).toHaveText("The final check could not finish, so nothing is shown and this job's bill stays locked.");
    const account = (await (await page.request.get(`/api/jobs/${jobId}/final-account`)).json()).account;
    const refused = await page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: { version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: account.id, expectedSourceHash: account.sourceHash, recipient: "fictional@example.invalid", issuedOn: "2026-11-10" } });
    expect(refused.ok()).toBe(false);
    // Force further real discovery passes, then verify there is no fourth execution.
    await admin.query("SELECT graphile_worker.add_job('discover_final_check_requests','{}'::json,max_attempts := 1)");
    await expect.poll(async () => Number((await admin.query("SELECT count(*) n FROM graphile_worker._private_jobs j JOIN graphile_worker._private_tasks t ON t.id=j.task_id WHERE t.identifier='discover_final_check_requests'")).rows[0].n), { timeout: 30000 }).toBe(0);
    expect((await requestRow()).executions).toBe(3); expect((await savedCheck()).state).toBe("failed");
    await removeFault();
    await test.step("API-driven restart through the authenticated runs request (Try again screen is a separate piece)", async () => {
      const response = await page.request.post(`/api/jobs/${jobId}/final-check/runs`, { data: { version: "final-check-run.request.v1" } });
      expect(response.ok(), await response.text()).toBe(true);
    });
    await expect.poll(async () => (await savedCheck()).state, { timeout: 180000, intervals: [1000, 3000] }).toBe("completed");
    const recovered = await requestRow(); expect(recovered.executions).toBe(1); expect(recovered.manifest_id).toBe(failed.manifest_id); expect(recovered.cycle_id).not.toBe(failed.cycle_id);
    expect((await admin.query("SELECT id,lock_id,manifest_hash,evidence_cutoff_at,attempt FROM app.final_check_manifest WHERE id=$1", [failed.manifest_id])).rows).toEqual(frozen);
    expect((await admin.query("SELECT id,input_hash FROM app.final_check_processing_source WHERE manifest_id=$1 ORDER BY id", [failed.manifest_id])).rows).toEqual(inventory);
    await page.reload(); await click("Load the saved final check");
    await expect(page.getByTestId("final-check-item")).toHaveCount(1);
    expect((await savedCheck()).items[0].estimatedValuePence).toBe(15000);
    expect((await (await page.request.get(`/api/jobs/${jobId}/final-account/lock`)).json()).lock).toEqual(lock);
    const issuing = page.waitForResponse(r => r.url().endsWith(`/api/jobs/${jobId}/customer-invoices`) && r.request().method() === "POST");
    await click("Issue and simulate this invoice"); const issued = await issuing; expect(issued.ok(), await issued.text()).toBe(true);
    const replay = await page.request.post(`/api/jobs/${jobId}/customer-invoices`, { data: issued.request().postDataJSON() }); expect(replay.ok()).toBe(true);
    const balance = await page.getByTestId("invoice-balance").textContent(); expect(balance).toBe("GBP 1,080.00");
    await test.info().attach("displayed-balance-after-worker-recovery", { body: JSON.stringify({ jobId, balance, viewport: page.viewportSize() }), contentType: "application/json" });
    await page.getByTestId("uiwire12-receipt-amount").fill(balance!.replace("GBP ", "").replaceAll(",", ""));
    await page.getByTestId("uiwire12-receipt-reference").fill("Fictional recovery receipt");
    const recording = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes("/receipts"));
    await click("Record practice receipt"); const recorded = await recording; expect(recorded.ok()).toBe(true);
    const receiptReplay = await page.request.post(recorded.url(), { data: recorded.request().postDataJSON() }); expect(receiptReplay.ok()).toBe(true);
    await page.reload(); await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00"); await expect(page.getByTestId("customer-payment-status")).toHaveText("Paid");
    await expect(page.getByTestId("uiwire12-receipt-history")).toHaveCount(1);
    expect((await (await page.request.get(`/api/jobs/${jobId}/customer-invoices`)).json()).invoices).toHaveLength(1);
    expect((await admin.query("SELECT count(*)::int n FROM app.final_account_lock_check WHERE job_id=$1", [jobId])).rows[0].n).toBe(1);
  } finally { await removeFault(); await admin.end(); }
});
