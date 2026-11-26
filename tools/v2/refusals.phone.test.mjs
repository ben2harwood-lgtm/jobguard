import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium, expect } from "../../apps/web/node_modules/@playwright/test/index.mjs";
import { assertBuilderRouteRefuses, assertSignedOutBuilderRefuses, guardCachedSignIn } from "./test/refusals.mjs";

// Mac lane B only, on a fresh seeded phone stack; no CI/plain-HTTP substitute.
// Sign-in pattern copied from K5A #929 (7560b597), with the rule-22 navigation
// wait and context.request calls. BH1 owns browser-session.mjs.
const origin = process.env.V2_TEST_ORIGIN;
assert.ok(origin && new URL(origin).protocol === "https:", "Set V2_TEST_ORIGIN to the launcher's HTTPS phone origin");
let browser, route;
const cache = new Map();
const signIn = guardCachedSignIn(name => {
  if (!cache.has(name)) cache.set(name, signInOnce(browser, name));
  return cache.get(name);
});

async function signInOnce(browser, localPart) {
  const jobTitle = "Occupied-home kitchen splashback and hall decorating";
  const origin = process.env.V2_TEST_ORIGIN;
  let context;
  let step = "create context";
  try {
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    step = "open sign-in";
    await page.goto(`${origin}/sign-in`);
    step = "request code";
    await page.getByLabel("Fictional email address").fill(`${localPart}@jobguard-v2.invalid`);
    await page.getByLabel("What do you want to do?").selectOption("signin");
    await page.getByRole("button", { name: "Request code" }).click();
    const code = page.getByTestId("fixture-code");
    await expect(code).toHaveText(/^[0-9]{8}$/u);
    await page.getByLabel("Eight-digit code").fill(await code.textContent());
    step = "verify code";
    const [verified] = await Promise.all([
      page.waitForResponse(`${origin}/api/auth/verify`),
      page.getByRole("button", { name: "Verify code" }).click(),
    ]);
    assert.equal(verified.status(), 200, "Code verification must succeed");
    const { csrfToken } = await verified.json();
    assert.ok(typeof csrfToken === "string" && csrfToken, "Verification must return a CSRF token");
    step = "finish sign-in navigation";
    await page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
    await page.waitForLoadState("networkidle");
    const membershipResponse = await context.request.get(`${origin}/api/auth/session`);
    assert.equal(membershipResponse.status(), 200);
    const { memberships } = await membershipResponse.json();
    assert.equal(memberships.length, 1);
    const signedIn = (await context.cookies()).filter(cookie => cookie.name === "jobguard_session")
      .map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
    step = "enter practice";
    const practice = await context.request.post(`${origin}/api/auth/practice`, {
      headers: { origin, "x-csrf-token": csrfToken },
      data: { version: "linked-practice-company.v1", action: "enter" },
    });
    assert.equal(practice.status(), 200);
    const { DEMO_TENANT_ID } = await import("../../packages/db/dist/index.js");
    const jobs = await context.request.get(`${origin}/api/jobs?tenantId=${DEMO_TENANT_ID}`);
    assert.equal(jobs.status(), 200);
    const jobId = (await jobs.json()).jobs.find(job => job.title.includes(jobTitle))?.id;
    if (localPart === "builder") assert.ok(jobId, "The seeded job must appear in Jobs");
    const cookies = (await context.cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
    step = "save session";
    return { origin, storageState: await context.storageState(), csrfToken, jobId, cookies, signedIn,
      realContext: { tenantId: memberships[0].tenantId } };
  } catch (cause) {
    const error = new Error(`V2 browser session failed at ${step}`, { cause });
    error.name = "V2BrowserSessionError";
    throw error;
  } finally {
    await context?.close();
  }
}


// Fresh jar for EVERY request: missing and capability cases cannot inherit the
// builder's Secure cookies. Copy explicit cookies unchanged, including after logout.
async function request(path, { cookies, csrf, tenantId, method = "GET", body } = {}, width = 360) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: 800 } });
  try {
    const response = await context.request.fetch(origin + path, {
      method, maxRedirects: 0,
      headers: { origin, ...(cookies && { cookie: cookies }), ...(csrf && { "x-csrf-token": csrf }),
        ...(tenantId && { "x-tenant-id": tenantId }) },
      ...(body !== undefined && { data: body }),
    });
    // headersArray keeps each Set-Cookie separate; headers() joins them with newlines.
    const headers = new Headers();
    for (const { name, value } of await response.headersArray()) headers.append(name, value);
    return new Response(await response.body(), { status: response.status(), headers });
  } finally { await context.close(); }
}
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM });
  const builder = await signIn("builder");
  await signIn("second-builder");
  const { DEMO_TENANT_ID } = await import("../../packages/db/dist/index.js");
  // d-real-csrf names the job's firm so the second firm is refused at membership.
  route = { path: `/api/v2-backend/jobs/${builder.jobId}`, transport: "api", tenantId: DEMO_TENANT_ID, expect: body => assert.equal(body.job.id, builder.jobId) };
});
after(async () => browser?.close());
for (const width of [360, 1280]) {
  test(`SX phone proxy exists and refuses cases a, b and d at ${width}px`, async t => {
    const observed = await assertBuilderRouteRefuses({ request: (path, options) => request(path, options, width), signIn, route });
    for (const row of observed) t.diagnostic(`SX phone ${width}px ${row.case}: ${row.status} ${row.code}`);
  });
}
// must stay the last test: it signs the cached builder out
// Pilot gate: real MON-5 customer and MON-8 crew sessions remain unproven here.
test("SX phone proxy refuses the old practice cookie after real signout", async t => {
  await assertSignedOutBuilderRefuses({ request, signIn, routes: [route],
    record: (_route, row) => t.diagnostic(`SX phone c: ${row.status} ${row.code}`),
  });
});
