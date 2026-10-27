import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
test.setTimeout(420_000);
const baseURL = "http://127.0.0.1:3000";
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const admin = () => new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo" });
const pounds = (pence: number) => `£${Math.floor(pence / 100).toLocaleString("en-GB")}.${String(pence % 100).padStart(2, "0")}`;
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const facts = async (page: Page) => ({ clients: await page.getByTestId("fact-clients").innerText(), operatives: await page.getByTestId("fact-operatives").innerText(), orders: await page.getByTestId("fact-orders").innerText(), value: await page.getByTestId("fact-value").innerText() });

test("the first contractor demo: operative logs an extra with photo and resident confirmation, surveyor prices, supervisor approves, client approves, and it survives a reload", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run drives all three viewports itself");
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
  await page.setViewportSize({ width: 360, height: 800 }); // mobile-360
  const op = { page };
  await op.page.goto("/site/extra");
  await expect(op.page.locator("main[data-site-extra-state]")).toHaveAttribute("data-site-extra-state", "ready");
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
  await op.page.screenshot({ path: "test-results/ENT-11a-operative-mobile-360.png", fullPage: true });
  const evidence = (await db.query("SELECT evidence_id,resident_confirmation_evidence_id FROM app.extra_origin WHERE tenant_id=$1", [tenant])).rows;
  expect(evidence).toHaveLength(1); expect(evidence[0].evidence_id).not.toBeNull(); expect(evidence[0].resident_confirmation_evidence_id).not.toBeNull();

  // 2. Surveyor prices from the seeded rate card.
  const rate = Number((await db.query("SELECT i.rate_pence n FROM app.sor_item i WHERE i.tenant_id=$1 AND i.code='CLEAR-VOID' LIMIT 1", [tenant])).rows[0].n);
  await switchTo("surveyor");
  await page.setViewportSize({ width: 1280, height: 800 }); // desktop
  const sv = { page };
  await sv.page.goto("/approvals/extras");
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
  await su.page.screenshot({ path: "test-results/ENT-11a-supervisor-desktop.png", fullPage: true });

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
  await cl.page.screenshot({ path: "test-results/ENT-11a-client-desktop.png", fullPage: true });

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

  // 7. Reset starts a new run and keeps the earlier audits.
  const auditsBefore = Number((await db.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1", [tenant])).rows[0].n);
  const rows = (await db.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [tenant])).rows;
  const nativeImport = new Function("specifier", "return import(specifier)") as (s: string) => Promise<{ verifyAuditChain: (events: unknown[]) => unknown }>;
  const { verifyAuditChain } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
  const asEvents = (list: typeof rows) => list.map(r => ({ id: r.id, version: r.version, tenantId: r.tenant_id, sequence: Number(r.sequence), actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash }));
  verifyAuditChain(asEvents(rows));
  await page.goto("/northside");
  await page.getByRole("button", { name: "Reset practice (new run)" }).click();
  await expect(page.getByTestId("fact-extras")).toHaveText("0", { timeout: 240_000 });
  await expect(page.getByTestId("fact-orders")).toHaveText("2000");
  const resetOrganisation = await page.request.get("/api/contractor");
  expect(resetOrganisation.status()).toBe(200);
  const resetTenant = (await resetOrganisation.json()).tenantId as string;
  const tenants = (await db.query("SELECT DISTINCT tenant_id FROM app.contractor_member WHERE tenant_id=ANY($1::uuid[])", [[tenant, resetTenant]])).rows;
  expect(tenants.length).toBeGreaterThanOrEqual(2);
  expect(Number((await db.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1", [tenant])).rows[0].n)).toBe(auditsBefore + 1); // the owner-authorized revoke appends one audit
  const retained = (await db.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [tenant])).rows;
  expect(retained.slice(0, rows.length)).toEqual(rows); verifyAuditChain(asEvents(retained));
  expect((await db.query("SELECT row_to_json(a)::text bytes FROM app.northside_action_attribution a WHERE tenant_id=$1 ORDER BY source_kind,source_id", [tenant])).rows).toEqual(attributionBefore);
  expect(Number((await db.query("SELECT count(*) n FROM app.extra_origin WHERE tenant_id=$1", [tenant])).rows[0].n)).toBe(1);
  await db.end();
});

test("hub GET fault injections: aborted transport, 503 and malformed JSON recover the stored practice without POST", async ({ page }) => {
  await page.goto("/northside");
  await page.getByRole("button", { name: "Start Northside practice", exact: true }).click();
  await expect(page.getByTestId("fact-orders")).toHaveText("2000", { timeout: 240_000 });
  const storedFacts = await facts(page);
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });

  for (const fault of ["aborted transport", "503", "malformed JSON"] as const) {
    await test.step(`GET fault injection: ${fault}`, async () => {
      await page.route("**/api/northside", async route => {
        expect(route.request().method()).toBe("GET");
        if (fault === "aborted transport") await route.abort("failed");
        else if (fault === "503") await route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"NORTHSIDE_UNAVAILABLE"}' });
        // A 200 with invalid JSON is failure injection, never a success API mock.
        else await route.fulfill({ status: 200, contentType: "application/json", body: '{"broken":' });
      });
      await page.reload();
      const alert = page.getByRole("alert");
      const retry = page.getByRole("button", { name: "Try again", exact: true });
      await expect(alert).toBeVisible();
      await expect(alert).toHaveText("The practice could not be loaded.");
      await expect(alert).toBeFocused();
      await expect(page.getByTestId("northside-status")).toHaveText("Practice not loaded.");
      await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
      expect(await noSideScroll(page)).toBe(true);
      await page.keyboard.press("Tab");
      await expect(retry).toBeFocused();
      expect(await retry.evaluate(button => button.matches(":focus-visible"))).toBe(true);
      const target = await retry.boundingBox();
      expect(target!.width).toBeGreaterThanOrEqual(44);
      expect(target!.height).toBeGreaterThanOrEqual(44);

      await page.unroute("**/api/northside");
      // Hold the real GET just long enough to inspect the pending state.
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/northside", async route => { await pending; await route.continue(); });
      try {
        await retry.click();
        await expect(retry).toBeDisabled();
        await expect(page.getByTestId("northside-status")).toHaveText("Loading…");
      } finally { release(); }
      await expect(page.getByTestId("northside-status")).toHaveText("Loaded from the stored practice");
      await page.unroute("**/api/northside");
      await expect(alert).toHaveCount(0);
      await expect(retry).toHaveCount(0);
      expect(await facts(page)).toEqual(storedFacts);
      expect(posts).toEqual([]);
      await page.reload();
      await expect(page.getByTestId("northside-status")).toHaveText("Loaded from the stored practice");
      expect(await facts(page)).toEqual(storedFacts);
      await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
      expect(await noSideScroll(page)).toBe(true);
      expect(posts).toEqual([]);
    });
  }
});

// Transport and HTTP fault regressions: neither is an empty assignment register.
for (const fault of ["transport", "http"] as const) {
  test(`assigned-job ${fault} failure is visible instead of no jobs`, async ({ page }) => {
    await page.route("**/api/contractor/site/jobs", async route => {
      if (fault === "transport") await route.abort("failed");
      else await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "SITE_VISIT_UNAVAILABLE" }) });
    });
    await page.route("**/api/northside/extras", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "NORTHSIDE_UNAVAILABLE" }) }));
    await page.goto("/site/extra");
    await expect(page.locator("main[data-site-extra-state]")).toHaveAttribute("data-site-extra-state", "failed");
    await expect(page.locator("main").getByRole("alert")).toContainText(fault === "http" ? "could not load" : "Failed to fetch");
    await expect(page.getByText("No jobs are assigned to you.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reload jobs and extras", exact: true })).toBeEnabled();
    await expect(page.getByRole("region", { name: "My extras" })).toContainText("Extras are unavailable.");
  });
}
