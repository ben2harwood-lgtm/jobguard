import { expect, test, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { installContractorAgreementFixture } from "./contractor-agreement-fixture.js";

// RED, synthetic only. The agreement fixture is the sole route interception/admin write.
// Its helper imports only pg and node:crypto, not the core/db package graph.
// All capture/visit requests use the real application; this Pool only reads facts.
test.setTimeout(420_000);
test.beforeEach(async ({ page }) => { await installContractorAgreementFixture(page); });

async function touchTarget(control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

// The four-tap budget begins on the selected job with an open visit, as in ENT-3.
// Setup, within-order questioning and close-out are outside that capture budget.
test("ENT-3 priced capture, order coverage and close-out persist in PostgreSQL at 360px", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-360", "priced capture proof runs only at mobile-360");
  expect(page.viewportSize()!.width).toBe(360);
  const db = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
  try {
    await page.goto("/northside");
    const start = page.getByRole("button", { name: "Start Northside practice", exact: true });
    await touchTarget(start); await start.click();
    await expect(page.getByTestId("fact-orders")).toHaveText("2000", { timeout: 240_000 });
    const response = await page.request.get("/api/contractor");
    expect(response.status()).toBe(200);
    const tenant = (await response.json()).tenantId as string;
    const operative = (await db.query("SELECT membership_id FROM app.contractor_member WHERE tenant_id=$1 AND email='demo.operative@fictional.invalid'", [tenant])).rows[0]!.membership_id as string;
    const act = page.getByRole("button", { name: "Act as operative", exact: true });
    await touchTarget(act); await act.click();
    await expect(page.getByTestId("actual-actor")).toContainText("Acting as operative");
    const captureBodies: Record<string, unknown>[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/site-extras/sor"))
        captureBodies.push(request.postDataJSON() as Record<string, unknown>);
    });
    await page.goto("/site/extra");
    const ready = async () => expect(page.locator("main[data-site-extra-state]")).toHaveAttribute("data-site-extra-state", "ready", { timeout: 60_000 });
    await ready();
    const job = (await db.query("SELECT job_id FROM app.work_order WHERE tenant_id=$1 AND reference='NS-1-0001'", [tenant])).rows[0]!.job_id as string;
    const jobControl = page.getByLabel("Job", { exact: true });
    await touchTarget(jobControl); await jobControl.selectOption(job);
    const visit = page.getByRole("region", { name: "Site visit", exact: true });
    const startVisit = visit.getByRole("button", { name: "Start visit", exact: true });
    await touchTarget(startVisit); await startVisit.click();
    const answer = page.getByLabel("Did the resident ask for anything extra?", { exact: true });
    await expect(answer).toBeVisible();
    const visits = (await db.query("SELECT id FROM app.site_visit WHERE tenant_id=$1 AND job_id=$2 AND membership_id=$3 AND completed_at IS NULL", [tenant, job, operative])).rows;
    expect(visits).toHaveLength(1);
    const visitId = visits[0]!.id as string;
    const complete = visit.getByRole("button", { name: "Complete visit", exact: true });
    await touchTarget(complete); await expect(complete).toBeDisabled();
    await expect(answer).toHaveValue("");

    const search = page.getByLabel("Search schedule of rates", { exact: true });
    await touchTarget(search);
    let taps = 0;
    const tap = async (control: Locator) => { await touchTarget(control); await control.click(); taps++; };
    const selectItem = async (code: string) => {
      await search.fill(code); // Typed search is excluded from the budget.
      await tap(visit.getByRole("button", { name: new RegExp(`^${code}:`) }));
    };
    const attach = page.getByRole("button", { name: "Attach practice photo", exact: true });
    const log = page.getByRole("button", { name: "Log extra", exact: true });
    const confirmation = page.getByRole("checkbox", { name: /The resident has seen this/ });
    const capture = async () => {
      await tap(page.getByRole("button", { name: "Finished", exact: true }));
      await touchTarget(attach); await attach.click(); // Photo is excluded from the budget.
      await expect(page.getByTestId("photo-attached")).toBeVisible();
      await expect(log).toBeDisabled();
      // The associated label is the full clickable target, including its 24px checkbox.
      await touchTarget(page.locator("label").filter({ has: confirmation }));
      await expect(confirmation).toHaveAccessibleName(/identity not verified/);
      await confirmation.check(); taps++;
      await tap(log);
      await expect(page.getByTestId("extra-logged")).toContainText("priced by the server");
      await ready();
      await noSideScroll(page);
    };
    await selectItem("CLEAR-VOID");
    await expect(page.getByText("New extra", { exact: true })).toBeVisible();
    await capture();
    expect(taps).toBeLessThanOrEqual(4);
    expect(taps).toBe(4);
    expect(captureBodies).toHaveLength(1);
    expect(Object.keys(captureBodies[0]!).sort()).toEqual([
      "commandId", "description", "note", "photoEvidenceId", "quantity", "residentConfirmation",
      "siteVisitId", "sorCode", "version", "workStatus",
    ].sort()); // No client rate, net, origin or actor is submitted.

    // Recompute from the stored schedule and baseline, never a price supplied by the browser.
    const pricedRows = async () => (await db.query(`SELECT r.*,i.rate_pence::text schedule_rate,
      b.adjustment_numerator::text baseline_numerator,b.adjustment_denominator::text baseline_denominator,
      app.sor_line_net_pence(r.quantity,i.rate_pence,b.adjustment_numerator,b.adjustment_denominator)::text expected_net,
      o.raising_membership_id origin_actor,o.site_visit_id,o.kind,
      p.id photo_id,p.evidence_type photo_type,p.server_verified_at photo_verified,
      c.id confirmation_id,c.evidence_type confirmation_type,c.server_verified_at confirmation_verified
      FROM app.extra_sor_revision r
      JOIN app.sor_item i ON(i.tenant_id,i.version_id,i.code)=(r.tenant_id,r.sor_version_id,r.sor_code)
      JOIN app.work_order_revision b ON(b.tenant_id,b.id)=(r.tenant_id,r.work_order_revision_id)
      JOIN app.extra_origin o ON(o.tenant_id,o.variation_id)=(r.tenant_id,r.variation_id)
      JOIN app.evidence_object p ON(p.tenant_id,p.job_id,p.id)=(o.tenant_id,o.job_id,o.evidence_id)
      JOIN app.evidence_object c ON(c.tenant_id,c.job_id,c.id)=(o.tenant_id,o.job_id,o.resident_confirmation_evidence_id)
      WHERE r.tenant_id=$1 AND r.job_id=$2 ORDER BY r.server_recorded_at,r.id`, [tenant, job])).rows;
    const first = await pricedRows();
    expect(first).toHaveLength(1);
    const verifyPriceAndOrigin = (row: (typeof first)[number]) => {
      expect(row.rate_pence).toBe(row.schedule_rate);
      expect(row.net_pence).toBe(row.expected_net);
      expect(row.adjustment_numerator).toBe(row.baseline_numerator);
      expect(row.adjustment_denominator).toBe(row.baseline_denominator);
      expect(row.raising_membership_id).toBe(operative);
      expect(row).toMatchObject({ origin_actor: operative, kind: "site_user", site_visit_id: visitId, photo_type: "site_photo", confirmation_type: "resident_confirmation" });
      expect(row.photo_id).toBeTruthy(); expect(row.confirmation_id).toBeTruthy();
      expect(row.photo_verified).not.toBeNull(); expect(row.confirmation_verified).not.toBeNull();
    };
    verifyPriceAndOrigin(first[0]!);
    expect(first[0]!.photo_id).toBe(captureBodies[0]!.photoEvidenceId);
    expect(first[0]!.command_id).toBe(captureBodies[0]!.commandId);
    expect(first[0]).toMatchObject({ sor_code: "CLEAR-VOID", coverage: "new", quantity: "1", claimed_quantity: "1" });
    const reloadedExtra = page.getByTestId("my-extra").filter({ hasText: "Clear void property" });
    await page.reload(); await ready();
    await expect(reloadedExtra).toContainText("photo");
    await expect(reloadedExtra).toContainText("resident confirmed");
    const extrasResponse = await page.request.get("/api/northside/extras");
    expect(extrasResponse.status()).toBe(200);
    const listed = (await extrasResponse.json()).extras.find((extra: { extraId: string }) => extra.extraId === first[0]!.variation_id);
    expect(listed).toMatchObject({ quotedPence: Number(first[0]!.expected_net), state: "awaiting_approval" });
    await expect(reloadedExtra).toContainText(` · price £${(Number(first[0]!.expected_net) / 100).toFixed(2)}`);
    await expect(reloadedExtra.getByTestId("my-extra-state")).toHaveText("Waiting for approval");
    expect(await pricedRows()).toEqual(first);
    await noSideScroll(page);

    // Northside's first order instructs exactly one door repair. No seed writes.
    const line = (await db.query(`SELECT l.* FROM app.work_order w
      JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id)
      JOIN app.work_order_line l ON(l.tenant_id,l.revision_id)=(c.tenant_id,c.revision_id)
      WHERE w.tenant_id=$1 AND w.job_id=$2 AND l.sor_code='REPAIR-DOOR'`, [tenant, job])).rows;
    expect(line).toHaveLength(1); expect(line[0]!.quantity).toBe("1");
    await selectItem("REPAIR-DOOR");
    await expect(page.getByText("Already on the order. Record a question for your supervisor; this is not an extra.", { exact: true })).toBeVisible();
    await expect(attach).toBeDisabled();
    await tap(page.getByRole("button", { name: "Ask supervisor", exact: true }));
    await expect(page.getByTestId("extra-logged")).toContainText("No extra was created");
    const questions = (await db.query("SELECT * FROM app.site_supervisor_query WHERE tenant_id=$1 AND job_id=$2", [tenant, job])).rows;
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ sor_code: "REPAIR-DOOR", quantity: "1", operative_membership_id: operative, order_line_scope_item_id: line[0]!.scope_item_id, order_revision_id: line[0]!.revision_id });
    expect(await pricedRows()).toEqual(first);
    expect((await db.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2", [tenant, job])).rows[0]!.n).toBe(1);

    await selectItem("REPAIR-DOOR");
    const quantity = page.getByLabel("Total quantity", { exact: true });
    await touchTarget(quantity); await quantity.fill("2");
    await expect(page.getByText("1 each more than ordered", { exact: true })).toBeVisible();
    await capture();
    const all = await pricedRows();
    expect(all).toHaveLength(2);
    const excess = all.find(row => row.sor_code === "REPAIR-DOOR")!;
    verifyPriceAndOrigin(excess);
    expect(excess).toMatchObject({ coverage: "excess", instructed_quantity: "1", claimed_quantity: "2", quantity: "1", excess_of_scope_item_id: line[0]!.scope_item_id });

    // Refusal is visible as a disabled completion control; no API bypass to submit an answer.
    await expect(complete).toBeDisabled();
    await touchTarget(answer); await answer.selectOption("yes");
    await tap(complete);
    await expect(visit.getByText("Visit completed. Your answer has been recorded.", { exact: true })).toBeVisible();
    const storedAnswer = async () => (await db.query("SELECT * FROM app.closeout_answer WHERE tenant_id=$1 AND site_visit_id=$2", [tenant, visitId])).rows;
    const answered = await storedAnswer();
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({ answer: "yes", membership_id: operative, job_id: job });
    await page.reload(); await ready();
    expect(await storedAnswer()).toEqual(answered);
    expect(await pricedRows()).toEqual(all);
    await expect(page.getByTestId("my-extra")).toHaveCount(2);
    await expect(reloadedExtra).toContainText("resident confirmed");
    await noSideScroll(page);
  } finally { await db.end(); }
});
