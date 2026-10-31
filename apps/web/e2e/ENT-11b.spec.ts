import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import baselineSample from "../../../docs/fixtures/contractor-full-demo-package.v1.json";
import type { projectEnterpriseDashboard, projectStoredDashboardBilling } from "@jobguard/core";
import type { StatementView } from "../app/lib/enterprise-statement-types";
test.setTimeout(600_000);
const baseURL = "http://127.0.0.1:3000";
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const admin = () => new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo" });
const pounds = (pence: number) => `£${Math.floor(pence / 100).toLocaleString("en-GB")}.${String(pence % 100).padStart(2, "0")}`;
const exactPounds = (value: { numerator: string; denominator: string }) => BigInt(value.numerator) % BigInt(value.denominator) === 0n
  ? pounds(Number(BigInt(value.numerator) / BigInt(value.denominator))) : `${value.numerator}/${value.denominator} pence`;
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const facts = async (page: Page) => ({ clients: await page.getByTestId("fact-clients").innerText(), operatives: await page.getByTestId("fact-operatives").innerText(), orders: await page.getByTestId("fact-orders").innerText(), value: await page.getByTestId("fact-value").innerText() });

// Full generated Northside practice, independently timed on phone and laptop. Not a human rehearsal.
for (const width of [360, 1280]) test(`ENT-11b full Northside through billing, statement and dashboard at ${width}px under ten minutes`, async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "this test explicitly runs both widths");
  const startedAt = Date.now();
  await page.setViewportSize({ width, height: 800 });
  const db = admin();
  // Owner starts and generates the contractor through the commands.
  await page.goto("/northside");
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Start Northside practice" }).click();
  await expect(page.getByTestId("fact-orders")).toHaveText("2000", { timeout: 240_000 });
  const organisation = await page.request.get("/api/contractor");
  expect(organisation.status()).toBe(200);
  const tenant = (await organisation.json()).tenantId as string;
  // Every number on screen is counted from the seeded rows.
  const count = async (sql: string) => String((await db.query(sql, [tenant])).rows[0].n);
  const shown = await facts(page);
  expect(shown.clients).toBe(await count("SELECT count(*) n FROM app.client_organisation WHERE tenant_id=$1"));
  expect(shown.operatives).toBe(await count("SELECT count(*) n FROM app.membership WHERE tenant_id=$1 AND role='operative'"));
  expect(shown.orders).toBe(await count("SELECT count(*) n FROM app.work_order WHERE tenant_id=$1"));
  expect([shown.clients, shown.operatives, shown.orders]).toEqual(["3", "40", "2000"]);
  const value = Number((await db.query("SELECT sum(r.net_total_pence) n FROM app.work_order_current c JOIN app.work_order_revision r ON(r.tenant_id,r.id)=(c.tenant_id,c.revision_id) WHERE c.tenant_id=$1", [tenant])).rows[0].n);
  expect(shown.value).toBe(pounds(value));

  // One jg_session throughout: each switch uses the product control and explicitly ends the previous switch.
  const originalCookie = (await page.context().cookies()).find(c => c.name === "jg_session")!.value;
  const switchTo = async (role: string) => {
    await page.goto("/northside");
    await page.getByRole("button", { name: role === "owner" ? "Return to owner" : `Act as ${role}`, exact: true }).click();
    await expect(page.getByTestId("actual-actor")).toContainText(`Acting as ${role}`);
    expect((await page.context().cookies()).find(c => c.name === "jg_session")!.value).toBe(originalCookie);
  };
  const ownerMember = (await db.query("SELECT owner_membership_id FROM app.northside_run WHERE tenant_id=$1", [tenant])).rows[0].owner_membership_id as string;
  const settings = (await db.query("SELECT settings_version,settings_hash,classification FROM app.northside_run WHERE tenant_id=$1", [tenant])).rows[0];
  expect(settings).toMatchObject({ settings_version: "northside-settings.v1", classification: "demo_settings" });
  await page.getByTestId("demo-settings").getByText("Demo settings", { exact: true }).click();
  await expect(page.getByTestId("demo-settings")).toContainText("Demo settings, not real rules — Ben sets these before any real customer");
  await expect(page.getByTestId("demo-settings")).toContainText("Demo setting, not a real rule");
  await expect(page.getByTestId("demo-settings")).toContainText("Timers and escalation are not scheduled");
  const description = "Extra: six further void units cleared";

  // 1. Operative, phone width.
  await switchTo("operative");
  const op = { page };
  await op.page.goto("/site/extra");
  // First operative read straight after generating 2,000 orders: the assigned-jobs query checks authority once per
  // assigned order (58 here, ~0.6 s on the DB suite's own run) and has exceeded the default 10 s on a busy runner.
  // The page is correct, only slow on this cold first load, so this one wait gets a longer budget; it still requires "ready".
  await expect(op.page.locator("main[data-site-extra-state]")).toHaveAttribute("data-site-extra-state", "ready", { timeout: 60_000 });
  await expect(op.page.getByText(banner, { exact: true })).toHaveCount(1);
  await expect(op.page.getByLabel("Job")).toContainText("NS-1-0001");
  await op.page.getByLabel("What is the extra work?").fill(description);
  await op.page.getByLabel("Note for the office").fill("Six more voids than the order listed; resident shown the photo.");
  await op.page.getByRole("button", { name: "Attach practice photo" }).click();
  await expect(op.page.getByTestId("photo-attached")).toBeVisible();
  await op.page.getByLabel(/The resident has seen this/).check();
  await op.page.getByRole("button", { name: "Log extra" }).click();
  await expect(op.page.getByTestId("extra-logged")).toBeVisible();
  expect(await noSideScroll(op.page)).toBe(true);
  await op.page.reload();
  await expect(op.page.getByTestId("my-extra")).toContainText(description);
  await expect(op.page.getByTestId("my-extra")).toContainText("photo");
  await expect(op.page.getByTestId("my-extra")).toContainText("resident confirmed");
  const evidence = (await db.query("SELECT evidence_id,resident_confirmation_evidence_id FROM app.extra_origin WHERE tenant_id=$1", [tenant])).rows;
  expect(evidence).toHaveLength(1); expect(evidence[0].evidence_id).not.toBeNull(); expect(evidence[0].resident_confirmation_evidence_id).not.toBeNull();

  // 2. Surveyor prices from the seeded rate card.
  const rate = Number((await db.query("SELECT i.rate_pence n FROM app.sor_item i WHERE i.tenant_id=$1 AND i.code='CLEAR-VOID' LIMIT 1", [tenant])).rows[0].n);
  await switchTo("surveyor");
  const sv = { page };
  // Role and rate controls settle only after this read; on a busy runner it can exceed the default 10 s.
  const [approvals] = await Promise.all([
    sv.page.waitForResponse(response => new URL(response.url()).pathname === "/api/northside/extras" && response.request().method() === "GET", { timeout: 60_000 }),
    sv.page.goto("/approvals/extras"),
  ]);
  expect(approvals.ok()).toBe(true);
  await approvals.finished();
  await expect(sv.page.getByTestId("approvals-role")).toHaveText("surveyor");
  await sv.page.getByLabel("Rate card item").selectOption("CLEAR-VOID");
  await sv.page.getByLabel("Quantity measured").fill("6");
  await expect(sv.page.getByTestId("price-preview")).toHaveText(pounds(rate * 6));
  await sv.page.getByRole("button", { name: "Price this extra" }).click();
  await expect(sv.page.getByTestId("extra-state")).toHaveText("Priced - ready to submit");
  await sv.page.reload();
  await expect(sv.page.getByTestId("extra-state")).toHaveText("Priced - ready to submit");

  // 3. Supervisor submits and approves.
  await switchTo("supervisor");
  const su = { page };
  await su.page.goto("/approvals/extras");
  await expect(su.page.getByTestId("extra-amount")).toHaveText(pounds(rate * 6));
  await su.page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(su.page.getByTestId("extra-state")).toHaveText("Waiting for approval");
  await su.page.getByRole("button", { name: "Approve as supervisor" }).click();
  await expect(su.page.getByTestId("extra-steps")).toContainText("supervisor: done");
  await expect(su.page.getByTestId("extra-steps")).toContainText("client approver: waiting");
  await su.page.reload();
  await expect(su.page.getByTestId("extra-steps")).toContainText("supervisor: done");

  // 4. Return explicitly to the owner for exact approval of a local fake request; pending is not delivery.
  await switchTo("owner");
  await page.goto("/approvals/extras");
  await page.getByRole("button", { name: "Approve sending to the client (practice)" }).click();
  const href = await page.getByTestId("client-link").getAttribute("href");
  expect(href).toMatch(/^\/extra-approval\/[0-9a-f-]{36}\/[0-9a-f-]{36}#t=/);
  await page.reload();
  await expect(page.getByTestId("client-link")).toHaveAttribute("href", href!);
  const outbox = (await db.query("SELECT adapter,status,recipient FROM app.action_outbox WHERE tenant_id=$1", [tenant])).rows;
  expect(outbox).toHaveLength(1); expect(outbox[0]).toMatchObject({ adapter: "fake_email", status: "pending" }); expect(outbox[0].recipient).toMatch(/\.invalid$/);

  // 5. Client decides on the link, desktop.
  await switchTo("client_approver");
  const cl = { page };
  await cl.page.goto(href!);
  await expect(cl.page.getByText(banner, { exact: true })).toHaveCount(1);
  await cl.page.getByLabel(/The email address this link was sent to/).fill("client.approver@northside-fictional.invalid");
  await cl.page.getByRole("button", { name: "Show the extra" }).click();
  await expect(cl.page.getByTestId("client-amount")).toHaveText(pounds(rate * 6));
  await expect(cl.page.getByTestId("client-description")).toHaveText(description);
  await expect(cl.page.getByTestId("client-company-approvals")).toContainText("supervisor");
  await expect(cl.page.getByTestId("actual-actor")).toContainText(ownerMember);
  await cl.page.getByRole("button", { name: "Approve this extra" }).click();
  await expect(cl.page.getByTestId("client-decided")).toContainText("approved");
  await cl.page.reload();
  await cl.page.getByLabel(/The email address this link was sent to/).fill("client.approver@northside-fictional.invalid");
  await cl.page.getByRole("button", { name: "Show the extra" }).click();
  await expect(cl.page.getByTestId("client-already")).toBeVisible();

  // 6. Everyone sees the stored result after a reload; the facts are the stored rows.
  await switchTo("operative"); await page.goto("/site/extra"); await page.reload(); await expect(page.getByTestId("my-extra-state")).toHaveText("Approved");
  await expect(page.getByTestId("action-attribution")).toContainText(ownerMember);
  await switchTo("supervisor"); await page.goto("/approvals/extras"); await page.reload(); await expect(page.getByTestId("extra-state")).toHaveText("Approved");
  await switchTo("owner"); await page.goto("/approvals/extras"); await page.reload(); await expect(page.getByTestId("extra-state")).toHaveText("Approved");
  const outcome = (await db.query("SELECT kind,actor_kind FROM app.extra_approval_outcome WHERE tenant_id=$1", [tenant])).rows;
  expect(outcome).toEqual([{ kind: "approved", actor_kind: "client_approver" }]);
  const fact = (await db.query("SELECT fictional_role_name,actual_tester_reference FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND actor_kind='client_approver'", [tenant])).rows;
  expect(fact).toEqual([{ fictional_role_name: "Fictional client approver", actual_tester_reference: `membership:${ownerMember}` }]);
  const nonPending = (await db.query("SELECT count(*)::int n FROM app.action_outbox WHERE tenant_id=$1 AND status NOT IN('pending','cancelled')", [tenant])).rows[0].n;
  expect(nonPending).toBe(0);
  expect((await db.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1", [tenant])).rows[0].n).toBe(0);
  const actionBindings = (await db.query(`SELECT r.command_type,a.actor_role,a.actor_membership_id,a.tester_membership_id,a.switch_id,a.settings_version,a.settings_hash
    FROM app.command_receipt r JOIN app.northside_action_attribution a ON(a.tenant_id,a.command_id)=(r.tenant_id,r.command_id)
    WHERE r.tenant_id=$1 AND r.command_type=ANY($2::text[]) ORDER BY r.completed_at`, [tenant, ["LogSiteExtra", "PriceExtra", "SubmitExtra", "ApproveExtraStep", "IssueClientApproval", "ClientDecideExtra"]])).rows;
  expect(actionBindings.map(a => a.actor_role)).toEqual(["operative", "surveyor", "supervisor", "supervisor", "owner", "client_approver"]);
  for (const a of actionBindings) { expect(a.tester_membership_id).toBe(ownerMember); expect(a.settings_hash).toBe(settings.settings_hash); expect(a.settings_version).toBe(settings.settings_version); expect(a.switch_id === null).toBe(a.actor_role === "owner"); }
  const attributionBefore = (await db.query("SELECT row_to_json(a)::text bytes FROM app.northside_action_attribution a WHERE tenant_id=$1 ORDER BY source_kind,source_id", [tenant])).rows;


  // Operations-only fixture provisioning, never a browser authority or production policy.
  const agreementId = crypto.randomUUID();
  await db.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
    VALUES($1,$2,'Northside fictional proposed terms',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01T00:00:00Z',false,$3,'synthetic_demo','operations:fictional-e2e')`, [tenant, agreementId, "c".repeat(64)]);
  await switchTo("finance");
  const order = (await db.query("SELECT id,job_id FROM app.work_order WHERE tenant_id=$1 AND reference='NS-1-0001'", [tenant])).rows[0];
  await page.goto(`/contractor/work-orders/${order.id}`);
  await page.getByRole("link", { name: "Billing and reconciliation", exact: true }).click();
  await expect(page.getByTestId("approved-not-exported")).toContainText(pounds(rate * 6));
  await page.getByTestId("approved-not-exported").locator("summary").click();
  await expect(page.getByTestId("approved-not-exported")).toContainText((await db.query("SELECT variation_id FROM app.extra_origin WHERE tenant_id=$1", [tenant])).rows[0].variation_id.slice(0, 8));
  await page.getByRole("button", { name: "Export approved extras", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Exported 1 line.");
  await page.getByRole("button", { name: "Export approved extras", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Nothing new to export.");
  await page.getByRole("button", { name: "Approve delivery", exact: true }).click();
  await expect(page.getByRole("link", { name: "Download CSV", exact: true })).toBeVisible();
  const download = await page.request.get(await page.getByRole("link", { name: "Download CSV", exact: true }).getAttribute("href") as string);
  expect(download.status()).toBe(200); expect(await download.text()).toContain(description);
  const stored = await (await page.request.get(`/api/contractor/jobs/${order.job_id}/billing`)).json();
  expect(stored.exports).toHaveLength(1); const line = stored.exports[0].lines[0];
  const match = { exportLineId: line.exportLineId, jobId: line.jobId, extraId: line.extraId, scopeItemId: line.scopeItemId, revisionId: line.revisionId, revisionHash: line.revisionHash };
  const amount = (net: number) => ({ netPence: net, vatPence: net / 5, grossPence: net * 6 / 5 }); // exact fixture integers
  const total = 100000 + rate * 6;
  const event = (factType: string, net: number, extra: Record<string, unknown> = {}) => ({ version: "billing-status.v1", clientContractId: line.clientContractId ?? (stored.clientContractIds[0]), source: "northside-fictional", sourceEventId: crypto.randomUUID(), invoiceNumber: "NS-INVOICE-1", factType, effectiveAt: "2026-10-03T12:00:00Z", remittanceReference: null, reconciliationId: null, originalEventId: null, amount: amount(net), composition: null, explicit: null, separateInvoice: false, lineAdjustments: [], ...extra });
  const invoice = event("invoiced", total, { effectiveAt: "2026-10-02T12:00:00Z", composition: { declared: amount(total), lines: [
    { externalInvoiceLineId: "order", kind: "original_order", existedAt: "2026-10-01T00:00:00Z", ...amount(100000), match: null },
    { externalInvoiceLineId: "extra", kind: "extra", existedAt: "2026-10-01T00:00:00Z", ...amount(rate * 6), match },
  ] } });
  async function importStatus(value: unknown) {
    await page.getByLabel("Format", { exact: true }).selectOption("json");
    await page.getByLabel("Status data", { exact: true }).fill(JSON.stringify(value));
    await page.getByRole("button", { name: "Import status", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Status imported.");
  }
  // Every invoice cell and total traces to the two imported composition lines and payments.
  async function traceBilling(paidDivisor: number) {
    const table = page.getByTestId("invoice-NS-INVOICE-1");
    for (const [lineId, net] of [["order", 100000], ["extra", rate * 6]] as const) {
      const cells = table.locator("tbody tr").filter({ has: page.getByRole("cell", { name: lineId, exact: true }) }).locator("td");
      await expect(cells.nth(1)).toHaveText(pounds(net));
      await expect(cells.nth(2)).toHaveText(pounds(0));
      await expect(cells.nth(3)).toHaveText(pounds(paidDivisor ? net / paidDivisor : 0));
    }
    const totals = table.locator("tbody tr").last().locator("th");
    await expect(totals.nth(1)).toHaveText(pounds(total));
    await expect(totals.nth(2)).toHaveText(pounds(0));
    await expect(totals.nth(3)).toHaveText(pounds(paidDivisor ? total / paidDivisor : 0));
    for (const testId of ["approved-not-exported", "unbilled-exports", "billed-differences", "credits", "rejections", "excess-payment"]) {
      const drill = page.getByTestId(testId);
      await expect(drill.locator("summary")).toContainText("£0.00 (0)");
      await drill.locator("summary").click(); await expect(drill).toContainText("None.");
      await drill.locator("summary").click();
    }
  }
  await expect(page.getByTestId(`export-${stored.exports[0].id}`)).toContainText(`1 line · net ${pounds(rate * 6)}`);
  await expect(page.getByTestId("unbilled-exports").locator("summary")).toContainText(`${pounds(rate * 6)} (1)`);
  await page.getByTestId("unbilled-exports").locator("summary").click();
  await expect(page.getByTestId("unbilled-exports")).toContainText(line.exportLineId.slice(0, 8));
  await importStatus(invoice); await traceBilling(0);
  await expect(page.getByTestId("invoice-NS-INVOICE-1").getByRole("cell", { name: "Billed", exact: true })).toHaveCount(2);
  const invoiceView = page.getByTestId("invoice-NS-INVOICE-1");
  await expect(invoiceView.locator("tbody tr").last()).toContainText(pounds(total));
  const part = event("paid", total / 2, { reconciliationId: "northside-part" });
  await importStatus(part); await expect(invoiceView.getByRole("cell", { name: "Part-paid", exact: true })).toHaveCount(2); await importStatus(part); // source replay must not allocate twice
  await expect(invoiceView.locator("tbody tr").last()).toContainText(pounds(total / 2));
  await page.reload(); await expect(invoiceView.locator("tbody tr").last()).toContainText(pounds(total / 2));
  await traceBilling(2);
  const paid = event("paid", total / 2, { effectiveAt: "2026-10-04T12:00:00Z", reconciliationId: "northside-balance" });
  await importStatus(paid); await traceBilling(1);
  await expect(invoiceView.getByRole("cell", { name: "Paid", exact: true })).toHaveCount(2);
  await expect(invoiceView.locator("tbody tr").last().locator("th").nth(3)).toHaveText(pounds(total));
  const persistedFacts = (await db.query("SELECT id,payload FROM app.billing_fact WHERE tenant_id=$1", [tenant])).rows;
  for (const event of [invoice, part, paid]) {
    expect(persistedFacts.find(f => f.payload.sourceEventId === event.sourceEventId)?.payload).toMatchObject({ factType: event.factType, amount: event.amount, invoiceNumber: event.invoiceNumber });
  }
  expect(persistedFacts.find(f => f.payload.factType === "invoiced")?.payload.composition.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ externalInvoiceLineId: "order", ...amount(100000), match: null }),
    expect.objectContaining({ externalInvoiceLineId: "extra", ...amount(rate * 6), match }),
  ]));
  expect(persistedFacts).toHaveLength(3);
  await page.getByRole("link", { name: "Monthly statement", exact: true }).click();
  const period = (await db.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p;
  await page.getByLabel("Fictional agreement version ID").fill(agreementId);
  await page.getByLabel("Statement month").fill(period);
  await page.getByRole("button", { name: "Derive and prepare statement", exact: true }).click();
  await expect(page.getByTestId("statement-total")).toHaveText(`Statement delta: ${pounds(rate * 6 / 10)}`);
  const details = page.getByRole("region", { name: "Stored statement" });
  await details.locator("summary").first().click();
  await expect(details).toContainText(line.extraId); await expect(details).toContainText(line.exportLineId);
  const sections = (await db.query("SELECT * FROM app.enterprise_fee_statement_section WHERE tenant_id=$1", [tenant])).rows;
  expect(sections).toHaveLength(1);
  await page.getByRole("button", { name: "Approve exact statement (practice)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Post approved statement (practice)" })).toBeVisible();
  await page.getByRole("button", { name: "Post approved statement (practice)" }).click();
  await expect(page.getByText(`accrual: ${pounds(rate * 6 / 10)}`, { exact: true })).toBeVisible();
  const statementId = (await db.query("SELECT id FROM app.enterprise_fee_statement WHERE tenant_id=$1", [tenant])).rows[0].id;
  await page.reload(); await page.getByLabel("Stored statement ID").fill(statementId);
  await page.getByRole("button", { name: "Reload stored statement", exact: true }).click();
  await expect(page.getByTestId("statement-total")).toHaveText(`Statement delta: ${pounds(rate * 6 / 10)}`);
  const readStatement = await page.request.post("/api/contractor/statements/read", { headers: { origin: baseURL }, data: { version: "enterprise-fee-screen-read.v1", statementId } });
  expect(readStatement.status()).toBe(200);
  const view = await readStatement.json() as StatementView;
  await details.locator("summary").first().click();
  expect(view.statement.period).toBe(period); expect(view.statement.revision).toBe(1);
  await expect(details.getByRole("heading")).toHaveText(`Statement ${period} · revision 1`);
  expect(view.statement.totalDeltaPence).toBe(rate * 6 / 10);
  expect(view.statement.totalDeltaPence).toBe(view.statement.sections.reduce((sum, section) => sum + section.deltaPence, 0));
  for (const section of view.statement.sections) {
    await expect(details.locator("summary").filter({ hasText: `Agreement ${section.agreementVersionId}` })).toHaveText(`Agreement ${section.agreementVersionId} · delta ${pounds(section.deltaPence)}`);
    expect(section.cumulativeFeePence).toBe(rate * 6 / 10); expect(section.priorNetPostedPence).toBe(0);
    expect(section.deltaPence).toBe(section.cumulativeFeePence - section.priorNetPostedPence);
    await expect(details).toContainText(`Cumulative fee ${pounds(section.cumulativeFeePence)} less prior net posted ${pounds(section.priorNetPostedPence)}`);
    const derivation = view.derivations.find(d => d.id === section.derivationId)!;
    expect(BigInt(derivation.qualifyingPrincipal.numerator)).toBe(BigInt(rate * 6) * BigInt(derivation.qualifyingPrincipal.denominator));
    const sources = (await db.query("SELECT * FROM app.enterprise_fee_contribution WHERE tenant_id=$1 AND derivation_id=$2", [tenant, derivation.id])).rows;
    expect(derivation.contributions).toHaveLength(sources.length); expect(sources.length).toBeGreaterThan(0);
    await expect(details).toContainText(`Qualifying principal: ${exactPounds(derivation.qualifyingPrincipal)}`);
    let numerator = 0n, denominator = 1n;
    for (const contribution of derivation.contributions) {
      numerator = numerator * BigInt(contribution.qualifyingPrincipal.denominator) + BigInt(contribution.qualifyingPrincipal.numerator) * denominator;
      denominator *= BigInt(contribution.qualifyingPrincipal.denominator);
    }
    expect(numerator).toBe(BigInt(rate * 6) * denominator);
    // Principal comes only from this extra's immutable paid allocations, including both part payments.
    for (const contribution of derivation.contributions) {
      expect(contribution.extraId).toBe(line.extraId); expect(contribution.exportLineId).toBe(line.exportLineId);
      expect(sources).toContainEqual(expect.objectContaining({ allocation_id: contribution.allocationId, run_id: contribution.runId }));
      await expect(details).toContainText(contribution.allocationId); await expect(details).toContainText(contribution.runId);
      await expect(details).toContainText(exactPounds(contribution.qualifyingPrincipal));
    }
  }
  expect(view.postings).toHaveLength(1);
  for (const posting of view.postings) {
    expect(posting.amountPence).toBe(view.statement.totalDeltaPence);
    expect(posting.lines.reduce((sum, l) => sum + l.debitPence - l.creditPence, 0)).toBe(0);
    const journal = details.locator("details").filter({ hasText: `Journal ${posting.id}` });
    await journal.locator("summary").click();
    for (const entry of posting.lines) await expect(journal).toContainText(`${entry.account}: debit ${pounds(entry.debitPence)}, credit ${pounds(entry.creditPence)}`);
  }
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  const now = new Date(), from = new Date(now.getTime() - 86400000).toISOString().slice(0, 10), until = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Captured from (UTC)").fill(from); await page.getByLabel("Until, exclusive (UTC)").fill(until);
  const activityResponse = page.waitForResponse(r => r.url().endsWith("/api/contractor/dashboard") && r.request().postDataJSON().resource === "activity");
  const billingResponse = page.waitForResponse(r => r.url().endsWith("/api/contractor/dashboard") && r.request().postDataJSON().resource === "billing");
  await page.getByRole("button", { name: "Load dashboard", exact: true }).click();
  const { report } = await (await activityResponse).json() as { report: ReturnType<typeof projectEnterpriseDashboard> };
  const labels = { captured: "Captured", approved: "Approved", backlog: "Pending approval steps", overdue: "Overdue steps", onTime: "Approvals on time", late: "Late approvals", closeoutYes: "Yes close-outs", closeoutNo: "No close-outs", closeoutMissing: "Missing close-out answers" };
  const sourceIds = new Set((await db.query(`SELECT command_id id FROM app.extra_origin WHERE tenant_id=$1
    UNION SELECT id FROM app.extra_event WHERE tenant_id=$1
    UNION SELECT id FROM app.extra_approval_request WHERE tenant_id=$1
    UNION SELECT id FROM app.extra_approval_step_fact WHERE tenant_id=$1
    UNION SELECT id FROM app.extra_approval_outcome WHERE tenant_id=$1
    UNION SELECT id FROM app.variation_revision WHERE tenant_id=$1
    UNION SELECT source_revision_id FROM app.extra_approval_revision_binding WHERE tenant_id=$1
    UNION SELECT id FROM app.extra_sor_revision WHERE tenant_id=$1`, [tenant])).rows.map(r => r.id));
  for (const [stage, label] of Object.entries(labels)) {
    const key = stage as keyof typeof labels, total = report.totals[key], rows = report.contributions.filter(c => c.stage === stage);
    expect(total.count).toBe(rows.length);
    expect(total.known.pence).toBe(rows.reduce((sum, c) => sum + (c.value?.pence ?? 0), 0));
    expect(total.unknownCount).toBe(rows.filter(c => c.value === null).length);
    const summary = page.locator("details > summary").filter({ hasText: new RegExp(`^${label}:`) });
    await expect(summary).toHaveText(`${label}: ${total.count}${["captured", "approved"].includes(stage) ? ` · known net ${pounds(total.known.pence)} · unknown values ${total.unknownCount}` : ""}`);
    await summary.click();
    for (const contribution of rows) {
      expect(contribution.jobId).toBe(order.job_id); expect(contribution.extraIds).toEqual([line.extraId]);
      for (const source of contribution.sourceIds) { expect(sourceIds.has(source)).toBe(true); await expect(summary.locator("..")).toContainText(source); }
    }
  }
  expect(report.totals.captured.count).toBe(1); expect(report.totals.approved.known.pence).toBe(rate * 6);
  for (const stage of ["backlog", "overdue", "closeoutYes", "closeoutNo", "closeoutMissing"] as const) expect(report.totals[stage].count).toBe(0);
  await expect(page.getByText("Close-out yes / answered: Not computable.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: `Activity groups (${report.groupCount} total)`, exact: true })).toBeVisible();
  for (const group of report.groups) {
    const drill = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: new RegExp(`^${group.id ?? "Unattributed"}$`) }) });
    await drill.locator("summary").click();
    for (const [stage, label] of Object.entries(labels)) {
      const total = group.totals[stage as keyof typeof labels];
      expect(total.count).toBe(group.contributions.filter(c => c.stage === stage).length);
      await expect(drill).toContainText(`${label}: ${total.count}${["captured", "approved"].includes(stage) ? ` · known net ${pounds(total.known.pence)} · unknown values ${total.unknownCount}` : ""}`);
    }
  }
  for (const stage of ["billed", "paid"]) {
    const summary = page.locator("summary").filter({ hasText: new RegExp(`^${stage}: 1 extras`) });
    await expect(summary).toHaveText(`${stage}: 1 extras · net ${pounds(rate * 6)}`);
    await summary.click(); await expect(summary.locator("..")).toContainText(line.extraId); await expect(summary.locator("..")).toContainText(line.exportLineId);
  }
  const billing = await (await billingResponse).json() as ReturnType<typeof projectStoredDashboardBilling>;
  await expect(page.getByRole("heading", { name: `Billing groups (${billing.groupCount} total)`, exact: true })).toBeVisible();
  for (const contribution of billing.contributions) {
    expect(contribution.extraId).toBe(line.extraId); expect(contribution.jobId).toBe(order.job_id);
    expect(contribution.exactPence).toEqual({ numerator: String(rate * 6), denominator: "1" });
    expect(persistedFacts.some(f => f.id === contribution.factId)).toBe(true);
    const run = (await db.query("SELECT input_hash FROM app.billing_allocation_run WHERE tenant_id=$1 AND id=$2", [tenant, contribution.runId])).rows;
    expect(run).toEqual([{ input_hash: contribution.inputHash }]);
    const drill = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: new RegExp(`^${contribution.stage}:`) }) });
    for (const ref of [contribution.revisionId, contribution.factId, contribution.runId, ...contribution.allocationIds]) await expect(drill).toContainText(ref);
  }
  for (const group of billing.groups) {
    const summary = page.locator("summary").filter({ hasText: `${group.id ?? "Unattributed"} · billed` });
    await expect(summary).toHaveText(`${group.id ?? "Unattributed"} · billed ${pounds(rate * 6)} · paid ${pounds(rate * 6)}`);
    await summary.click(); await expect(summary.locator("..")).toContainText(line.extraId);
  }
  await page.getByRole("button", { name: "Load fictional Northside baseline sample", exact: true }).click();
  const teams = (await db.query("SELECT id FROM app.team WHERE tenant_id=$1 ORDER BY id LIMIT 2", [tenant])).rows;
  await page.getByLabel(/Historical team =/).fill(`fictional-pilot=${teams[0].id}\nfictional-rest=${teams[1].id}`);
  await page.getByRole("button", { name: "Import history", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("History imported");
  await page.getByLabel("Pilot historical team IDs (comma separated)").fill("fictional-pilot");
  await page.getByLabel("Rest historical team IDs (comma separated)").fill("fictional-rest");
  await page.getByRole("button", { name: "Compare baseline", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pilot baseline comparison", exact: true })).toBeVisible();
  // Historical figures drill into the same fictional source jobs, including unknown values and zero-extra jobs.
  for (const cohort of ["pilot", "rest"] as const) {
    const jobs = baselineSample.history.jobs.filter(j => j.teamId === `fictional-${cohort}`);
    const extras = jobs.flatMap<(typeof jobs)[number]["extras"][number]>(j => j.extras), known = extras.reduce((n, e) => n + (e.reportedNet?.pence ?? 0), 0);
    const unknown = extras.filter(e => e.reportedNet === null).length;
    const summary = page.locator("summary").filter({ hasText: new RegExp(`^${cohort}:`) });
    await expect(summary).toHaveText(`${cohort}: ${jobs.length} jobs · ${extras.length} extras · known net ${pounds(known)} · unknown values ${unknown}`);
    const drill = summary.locator("..");
    await expect(drill).toContainText("Extras per 100 jobs: 250/3 (complete)");
    await expect(drill).toContainText(`Known value per job: ${known}/${jobs.length} pence (incomplete)`);
    for (const job of jobs) {
      const jobRow = drill.locator("li").filter({ hasText: `Job ${job.sourceJobId} ·` });
      const net = job.extras.reduce((n, e) => n + (e.reportedNet?.pence ?? 0), 0);
      await expect(jobRow).toContainText(`known net ${pounds(net)} · unknown values ${job.extras.filter(e => e.reportedNet === null).length}`);
      for (const extra of job.extras) await expect(jobRow).toContainText(`Extra ${extra.sourceExtraId} · work ${extra.sourceWorkId} · ${extra.reportedNet ? pounds(extra.reportedNet.pence) : "Unknown value"}`);
    }
  }
  const baselineDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download baseline with method (json)", exact: true }).click();
  expect((await baselineDownload).suggestedFilename()).toBe("pilot-baseline.json");
  expect(await noSideScroll(page)).toBe(true);
  const elapsedMs = Date.now() - startedAt;
  await info.attach(`Northside-${width}-timing`, { body: JSON.stringify({ elapsedMs, maximumMs: 600000, humanRehearsal: false }), contentType: "application/json" });
  expect(elapsedMs).toBeLessThan(600000);
  await db.end();
});
