import { seedActiveContractorAgreement } from "../../../packages/db/test/contractor-agreement-test-fixture.js";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { appendAuditBatch } from "../../../packages/db/src/audit";
import { withTenant } from "../../../packages/db/src/tenant-context";
import { testTenantContext } from "../../../packages/db/test/tenant-context-test-utils";
import { generateTestIdentityProvider } from "../../api/src/auth/sso/test-identity-provider";

// Written before the screen. NOT RUN in the builder sandbox (PostgreSQL/browser unavailable).
// Fixtures only create fictional persisted owner sessions; all SSO successes use real routes and PostgreSQL.
type Api = { status: number; body: any };
async function api(page: Page, path: string, data?: unknown, csrfToken?: string): Promise<Api> {
  return page.evaluate(async input => {
    const response = await fetch(input.path, {
      method: input.data === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { ...(input.data === undefined ? {} : { "content-type": "application/json" }), ...(input.csrfToken ? { "x-csrf-token": input.csrfToken } : {}) },
      ...(input.data === undefined ? {} : { body: JSON.stringify(input.data) }),
    });
    return { status: response.status, body: await response.json() };
  }, { path, data, csrfToken });
}
async function owner(context: BrowserContext) {
  const tenantId = randomUUID(), userId = randomUUID(), membershipId = randomUUID(), accountId = randomUUID(), assignmentId = randomUUID();
  const email = `admin-${randomUUID()}@fictional.invalid`, token = randomBytes(32).toString("base64url"), csrfToken = randomBytes(24).toString("base64url");
  const pool = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
  try {
    await withTenant(pool, testTenantContext(tenantId), async db => {
      await db.$client.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
      await db.$client.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
      await db.$client.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [email, userId]);
      await db.$client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional SAML contractor')", [accountId, tenantId]);
      await db.$client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [membershipId, tenantId, accountId, userId]);
      await db.$client.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [userId, tenantId, membershipId]);
      await db.$client.query("SELECT app.assign_commercial_track($1,$2,'contractor',$3,0,'ENT-10a:e2e-fixture')", [tenantId, assignmentId, `synthetic-agreement:${randomUUID()}`]);
      await db.$client.query("INSERT INTO app.org_unit(tenant_id,id,kind,name) VALUES($1,$1,'tenant','Fictional SAML contractor')", [tenantId]);
      await db.$client.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,$3)", [tenantId, membershipId, email]);
      await db.$client.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'owner','tenant',$1)", [tenantId, randomUUID(), membershipId]);
      const digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
      await db.$client.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')", [randomUUID(), userId, digest, csrfToken]);
      await appendAuditBatch(db,[{id:assignmentId,version:"audit.v1",actorRef:"ENT-10a:e2e-fixture",eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:tenantId,payload:{references:{assignment:assignmentId,environment:"synthetic_demo"},classifications:{action:"security"}}}]);
    });
    await seedActiveContractorAgreement(pool, tenantId);
  } finally { await pool.end(); }
  await context.addCookies([{ name: "jobguard_session", value: token, url: "http://127.0.0.1:3000", httpOnly: true, secure: true, sameSite: "Strict" }]);
  return { tenantId, csrfToken };
}

test("SAML admin persists explicit domain and role mapping across reload and another context; signed test IdP provisions a bounded session", async ({ page, browser }) => {
  const account = await owner(page.context()), idp = generateTestIdentityProvider();
  await page.goto("/admin/contractor/identity");
  await expect(page.getByTestId("sso-tenant")).toHaveText(account.tenantId);
  await expect(page.getByRole("note", { name: "SAML sandbox notice" })).toContainText("synthetic");
  await page.getByLabel("Test identity provider public key").fill(idp.idpCert);
  await page.getByRole("button", { name: "Create test SAML connection", exact: true }).click();
  await expect(page.getByTestId("sso-connection")).toHaveCount(1);
  const connectionId = await page.getByLabel("SAML connection", { exact: true }).inputValue();
  const domain = `site-${randomUUID()}.invalid`;
  await page.getByLabel("Fictional verified domain").fill(domain);
  await page.getByRole("button", { name: "Verify test domain", exact: true }).click();
  await expect(page.getByTestId("sso-domain")).toContainText(domain);
  await page.getByLabel("Identity provider group").fill("site-admins");
  await page.getByLabel("Mapped contractor role").selectOption("admin");
  await page.getByRole("button", { name: "Save explicit mapping", exact: true }).click();
  await expect(page.getByTestId("sso-mapping")).toContainText("site-admins → admin");
  await expect(page.getByTestId("sso-mapping")).not.toContainText("finance");
  await expect(page.getByTestId("sso-mapping")).not.toContainText("commercial_manager");
  await expect(page.getByTestId("sso-event").filter({ hasText: "mapping" })).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("sso-domain")).toContainText(domain);
  await expect(page.getByTestId("sso-mapping")).toContainText("site-admins → admin");
  const second = await browser.newContext({ storageState: await page.context().storageState() });
  const newcomer = await browser.newContext();
  try {
    const tab = await second.newPage(); await tab.goto("/admin/contractor/identity");
    await expect(tab.getByTestId("sso-mapping")).toContainText("site-admins → admin");
    expect(await tab.getByTestId("sso-event").allTextContents()).toEqual(await page.getByTestId("sso-event").allTextContents());
    const view = await api(page, `/api/auth/sso/${connectionId}/start?requested_tenant_id=${account.tenantId}`, undefined, account.csrfToken);
    expect(view.status).toBe(200);
    const connection = { ...view.body.connections[0], tenantId: account.tenantId, idpCert: idp.idpCert, entryPoint: "https://test-idp.invalid/sso" };
    const signIn = await newcomer.newPage(); await signIn.goto("/sign-in");
    const started = await api(signIn, `/api/auth/sso/${connectionId}/start`, { version: "sso-start.v1", action: "signin" });
    expect(started.status).toBe(200);
    const SAMLResponse = idp.response({ connection, requestId: started.body.requestId, email: `site-user@${domain}`, subject: randomUUID(), groups: ["site-admins"] });
    const callback = await api(signIn, `/api/auth/sso/${connectionId}/callback`, { version: "sso-callback.v1", SAMLResponse, relayState: started.body.relayState });
    expect(callback.status).toBe(200); expect(callback.body.version).toBe("sso-signed-in.v1"); expect(callback.body.tenantId).toBe(account.tenantId);
    const session = await api(signIn, "/api/auth/session"); expect(session.status).toBe(200); expect(session.body.memberships.map((m: any) => m.tenantId)).toEqual([account.tenantId]);
    const sessionCookie = (await newcomer.cookies()).find(cookie => cookie.name === "jobguard_session")!;
    expect(sessionCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict" });
    expect(sessionCookie.expires - Date.now() / 1000).toBeLessThanOrEqual(connection.sessionLimitSeconds);
    await signIn.goto("/admin/contractor/identity"); await expect(signIn.getByTestId("sso-mapping")).toContainText("site-admins → admin");
    await signIn.reload(); await expect(signIn.getByTestId("sso-tenant")).toHaveText(account.tenantId);
    const replay = await api(signIn, `/api/auth/sso/${connectionId}/callback`, { version: "sso-callback.v1", SAMLResponse, relayState: started.body.relayState });
    expect(replay.status).toBeGreaterThanOrEqual(400); expect(typeof replay.body.code).toBe("string");
  } finally { await second.close(); await newcomer.close(); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const reload = page.getByRole("button", { name: "Reload persisted identity", exact: true }); await reload.focus(); await expect(reload).toBeFocused();
  expect(await reload.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  const bounds = await reload.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
});

test("failed authoritative reload disables admin writes and recovers the persisted tenant", async ({ page }) => {
  const account = await owner(page.context()); await page.goto("/admin/contractor/identity"); await expect(page.getByTestId("sso-tenant")).toHaveText(account.tenantId);
  let drop = true;
  await page.route("**/api/auth/sso/**/start?*", async route => { if (drop && route.request().method() === "GET") await route.abort("failed"); else await route.continue(); });
  await page.getByRole("button", { name: "Reload persisted identity", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByRole("main").getByRole("status")).toContainText("out-of-date");
  await expect(page.getByRole("button", { name: "Create test SAML connection", exact: true })).toBeDisabled();
  drop = false; await page.getByRole("button", { name: "Reload persisted identity", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0); await expect(page.getByTestId("sso-tenant")).toHaveText(account.tenantId);
});

test("unauthenticated administrators get a sign-in link and no configuration controls", async ({ page }) => {
  await page.goto("/admin/contractor/identity");
  await expect(page.getByRole("link", { name: "Sign in to your verified account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create test SAML connection", exact: true })).toHaveCount(0);
});
