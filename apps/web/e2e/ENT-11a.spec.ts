import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";
test.setTimeout(420_000);
const baseURL = "http://127.0.0.1:3000";
const banner = "Practice sandbox — synthetic data; nothing is sent or charged";
const admin = () => new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo" });
const pounds = (pence: number) => `£${Math.floor(pence / 100).toLocaleString("en-GB")}.${String(pence % 100).padStart(2, "0")}`;
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Test support only: the product has no in-product role switch (held), so the test stores a live practice session for a seeded member directly. */
async function sessionFor(db: Pool, tenant: string, email: string) {
  const m = (await db.query("SELECT c.membership_id,m.identity_user_id FROM app.contractor_member c JOIN app.membership m ON(m.tenant_id,m.id)=(c.tenant_id,c.membership_id) WHERE c.tenant_id=$1 AND c.email=$2", [tenant, email])).rows[0];
  const token = randomUUID(), digest = createHash("sha256").update(token).digest("hex");
  await db.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,clock_timestamp(),clock_timestamp()+interval '1 day')", [tenant, m.membership_id, m.identity_user_id, digest]);
  return token;
}
async function as(browser: Browser, token: string, mobile: boolean) {
  const context = await browser.newContext({ baseURL, viewport: mobile ? { width: 360, height: 800 } : { width: 1280, height: 800 } });
  await context.addCookies([{ name: "jg_session", value: token, url: baseURL }]);
  return { context, page: await context.newPage() };
}
const facts = async (page: Page) => ({ clients: await page.getByTestId("fact-clients").innerText(), operatives: await page.getByTestId("fact-operatives").innerText(), orders: await page.getByTestId("fact-orders").innerText(), value: await page.getByTestId("fact-value").innerText() });

test("the first contractor demo: operative logs an extra with photo and resident confirmation, surveyor prices, supervisor approves, client approves, and it survives a reload", async ({ page, browser }, info) => {
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

  const sessions = {
    operative: await sessionFor(db, tenant, "demo.operative@fictional.invalid"), surveyor: await sessionFor(db, tenant, "surveyor@northside-fictional.invalid"),
    supervisor: await sessionFor(db, tenant, "supervisor@northside-fictional.invalid"), client: await sessionFor(db, tenant, "client.approver@northside-fictional.invalid"),
  };
  const description = "Extra: six further void units cleared";

  // 1. Operative, phone width.
  const op = await as(browser, sessions.operative, true);
  await op.page.goto("/site/extra");
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
  const sv = await as(browser, sessions.surveyor, false);
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
  const su = await as(browser, sessions.supervisor, false);
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

  // 4. Owner approves the send; the message is queued to the practice adapter and nothing leaves.
  await page.goto("/approvals/extras");
  await page.getByRole("button", { name: "Approve sending to the client (practice)" }).click();
  const href = await page.getByTestId("client-link").getAttribute("href");
  expect(href).toMatch(/^\/extra-approval\/[0-9a-f-]{36}\/[0-9a-f-]{36}#t=/);
  const outbox = (await db.query("SELECT adapter,status,recipient FROM app.action_outbox WHERE tenant_id=$1", [tenant])).rows;
  expect(outbox).toHaveLength(1); expect(outbox[0]).toMatchObject({ adapter: "fake_email", status: "pending" }); expect(outbox[0].recipient).toMatch(/\.invalid$/);

  // 5. Client decides on the link, desktop.
  const cl = await as(browser, sessions.client, false);
  await cl.page.goto(href!);
  await expect(cl.page.getByText(banner, { exact: true })).toHaveCount(1);
  await cl.page.getByLabel(/The email address this link was sent to/).fill("client.approver@northside-fictional.invalid");
  await cl.page.getByRole("button", { name: "Show the extra" }).click();
  await expect(cl.page.getByTestId("client-amount")).toHaveText(pounds(rate * 6));
  await expect(cl.page.getByTestId("client-description")).toHaveText(description);
  await expect(cl.page.getByTestId("client-company-approvals")).toContainText("supervisor");
  await cl.page.getByLabel(/Your role/).fill("Fictional housing officer");
  await cl.page.getByLabel("Who is really testing").fill("Practice tester");
  await cl.page.getByRole("button", { name: "Approve this extra" }).click();
  await expect(cl.page.getByTestId("client-decided")).toContainText("approved");
  await cl.page.reload();
  await cl.page.getByLabel(/The email address this link was sent to/).fill("client.approver@northside-fictional.invalid");
  await cl.page.getByRole("button", { name: "Show the extra" }).click();
  await expect(cl.page.getByTestId("client-already")).toBeVisible();
  await cl.page.screenshot({ path: "test-results/ENT-11a-client-desktop.png", fullPage: true });

  // 6. Everyone sees the stored result after a reload; the facts are the stored rows.
  await op.page.reload(); await expect(op.page.getByTestId("my-extra-state")).toHaveText("Approved");
  await su.page.reload(); await expect(su.page.getByTestId("extra-state")).toHaveText("Approved");
  await page.reload(); await expect(page.getByTestId("extra-state")).toHaveText("Approved");
  const outcome = (await db.query("SELECT kind,actor_kind FROM app.extra_approval_outcome WHERE tenant_id=$1", [tenant])).rows;
  expect(outcome).toEqual([{ kind: "approved", actor_kind: "client_approver" }]);
  const fact = (await db.query("SELECT fictional_role_name,actual_tester_reference FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND actor_kind='client_approver'", [tenant])).rows;
  expect(fact).toEqual([{ fictional_role_name: "Fictional housing officer", actual_tester_reference: "Practice tester" }]);
  const nonPending = (await db.query("SELECT count(*)::int n FROM app.action_outbox WHERE tenant_id=$1 AND status NOT IN('pending','cancelled')", [tenant])).rows[0].n;
  expect(nonPending).toBe(0);

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
  expect(Number((await db.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1", [tenant])).rows[0].n)).toBe(auditsBefore);
  expect(Number((await db.query("SELECT count(*) n FROM app.extra_origin WHERE tenant_id=$1", [tenant])).rows[0].n)).toBe(1);
  for (const c of [op.context, sv.context, su.context, cl.context]) await c.close();
  await db.end();
});
