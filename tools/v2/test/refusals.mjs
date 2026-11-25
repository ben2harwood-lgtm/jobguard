import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export const financialDenyList = ["title", "customer", "email", "profit", "margin", "cost", "amount", "price", "finding", "pence"];
const refusalCodes = new Set(["UNAUTHENTICATED", "TENANT_FORBIDDEN", "FORBIDDEN", "NOT_FOUND"]);
const readOnly = new Set(["GET", "HEAD"]);

function assertNoKeys(value, denyList) {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!denyList.some(word => key.toLowerCase().includes(word.toLowerCase())),
      "response contains a forbidden field");
    if (key === "jobs") assert.deepEqual(child, [], "refusal contains jobs[0]");
    assertNoKeys(child, denyList);
  }
}

function assertNoAmounts(value) {
  // Refusals carry codes, never currency, decimal money or unlabelled numeric
  // values that could be pence. Check nested values as well as field names.
  assert.notEqual(typeof value, "number", "refusal contains a numeric value");
  if (typeof value === "string") {
    assert.doesNotMatch(value, /£|\b(?:GBP|pence)\b|\d+\.\d{2}\b|\b\d+\s*p\b|(?:^|[\s:=])[-+]?\d+(?:[.,]\d+)?(?:$|[\s,;])/iu,
      "refusal contains a possible monetary value");
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(assertNoAmounts);
  }
}

// Append future builder GET routes here (rule 29). Paths stay relative to the
// named transport so the same request helper proves positive and negative reads.
export const builderGetRoutes = [
  { path: "/api/jobs?tenantId={tenantId}", list: true, expect: (body, { jobId }) => assert.ok(body.jobs.some(job => job.id === jobId)) },
  { path: "/api/jobs/{jobId}", expect: (body, { jobId }) => assert.equal(body.job.id, jobId) },
  { path: "/api/jobs/{jobId}/proposal", expect: (body, { jobId }) => { assert.equal(body.review.jobId, jobId); assert.ok(body.review.lines.length); } },
  { path: "/api/jobs/{jobId}/parties", expect: body => assert.equal(body.current.customer.email, "customer@jobguard-v2.invalid") },
  { path: "/api/jobs/{jobId}/materials", expect: body => assert.equal(body.materials[0].merchant, "Fictional Teacup Tile Merchant") },
  { path: "/api/jobs/{jobId}/quotes", expect: (body, { jobId }) => { assert.equal(body.jobId, jobId); assert.ok(body.revisions.length); } },
  { path: "/api/jobs/{jobId}/quotes/delivery", expect: body => { assert.equal(body.status, "simulated_delivery"); assert.equal(body.effects.realExternalActions, 0); } },
  { path: "/api/jobs/{jobId}/quotes/acceptance", expect: body => { assert.ok(body.activeAcceptance); assert.equal(body.activeAcceptance.documentId, body.currentDocument.id); } },
  { path: "/jobs/{jobId}", transport: "api", expect: (body, { jobId }) => assert.equal(body.job.id, jobId) },
  { path: "/jobs/{jobId}/fee-illustration", transport: "api", optional: true, expect: body => { assert.equal(body.version, "fee-illustration-response.v1"); assert.ok(body.source); assert.ok(body.result); } },
];

export function bindBuilderRoutes({ jobId, tenantId }) {
  return builderGetRoutes.map(route => ({ ...route,
    path: route.path.replaceAll("{jobId}", jobId).replaceAll("{tenantId}", tenantId),
    expect: body => route.expect(body, { jobId, tenantId }),
  }));
}

// Wrap an existing caller-owned cache; never create sessions or request OTPs here.
export function guardCachedSignIn(cachedSignIn) {
  let revoked = false;
  const signIn = name => {
    assert.ok(name !== "builder" || !revoked, "SX cached builder revoked: signout must stay the last test");
    return cachedSignIn(name);
  };
  signIn.revokeBuilder = () => { revoked = true; };
  return signIn;
}

export async function assertBuilderPositive({ request, signIn, route, expect = route.expect }) {
  assert.equal(route.method ?? "GET", "GET", "SX builder inventory is GET only");
  assert.equal(typeof expect, "function", "positive body assertion required");
  const builder = await signIn("builder");
  const response = await request(route.path, { cookies: builder.cookies, transport: route.transport });
  if (route.optional && response.status !== 200) return false;
  assert.equal(response.status, 200, `SX positive control ${route.path}: planner miss; stop round 1 (status ${response.status})`);
  try { await expect(await response.json()); }
  catch { assert.fail(`SX positive control ${route.path}: unexpected body; planner miss; stop round 1`); }
  return true;
}

async function assertRefusal(response, denyList, { emptyJobs = false, sessionCase = false, nestCode } = {}) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { assert.fail("refusal must be typed JSON"); }
  if (emptyJobs && response.status === 200) {
    assert.deepEqual(body.jobs, [], "second firm must see no jobs");
    assertNoKeys(body, denyList);
    if ("version" in body) assert.equal(body.version, 1, "unexpected jobs-list schema version");
    const { version: _version, ...rest } = body;
    assertNoAmounts(rest);
    return { status: 200, code: "jobs: []" };
  }
  assert.ok((sessionCase ? [401] : [401, 403, 404]).includes(response.status), `expected typed refusal, got ${response.status}`);
  assertNoKeys(body, denyList);
  assertNoAmounts(body);
  if (nestCode) {
    assert.equal(response.status, 403, "expected exact Nest refusal status 403");
    assert.equal(body?.code, nestCode, "expected exact Nest refusal code for this CSRF step");
  } else assert.ok(refusalCodes.has(body?.code), "refusal must contain an allowed typed code");
  return { status: response.status, code: body.code };
}

async function checkRequest(request, route, credentials, denyList, checkDatabase, refusalOptions) {
  const method = route.method ?? "GET";
  const snapshot = route.checkDatabase ?? checkDatabase;
  assert.ok(readOnly.has(method) || typeof snapshot === "function", "mutations require a database snapshot callback");
  const before = snapshot ? await snapshot() : undefined;
  try {
    return await assertRefusal(await request(route.path, {
      method, transport: route.transport, ...(route.body !== undefined && { body: route.body }), ...credentials,
    }), denyList, refusalOptions);
  } finally {
    if (snapshot) assert.deepEqual(await snapshot(), before, "refused request changed database state");
  }
}

/** Cases (a), (b) and (d). Case (c) belongs exclusively to the last test. */
export async function assertBuilderRouteRefuses({ request, signIn, route, expect = route.expect, denyList = financialDenyList }) {
  assert.ok(await assertBuilderPositive({ request, signIn, route, expect }), "optional route must be removed explicitly after its positive control");
  const second = await signIn("second-builder");
  assert.ok(second.signedIn && second.cookies && second.realContext?.tenantId, "both second-firm contexts required");
  const unknownSession = randomUUID();
  const cases = [
    ["a", {}],
    ["b-format", { cookies: "jg_session=fictional-invalid; jobguard_session=fictional-invalid" }],
    ["b-unknown-uuid", { cookies: `jg_session=${unknownSession}; jobguard_session=${unknownSession}` }],
    ...(route.transport === "api" ? [
      ["d-real-no-csrf", { cookies: second.signedIn }, "ORIGIN_FORBIDDEN"],
      ["d-real-csrf", { cookies: second.signedIn, csrf: second.csrfToken }, "SYNTHETIC_WORKFLOW_ONLY"],
    ] : [["d-real", { cookies: second.signedIn }]]),
    ["d-practice", { cookies: second.cookies }],
  ];
  const observed = [];
  for (const [name, credentials, nestCode] of cases) {
    try {
      if (name === "d-real-csrf") assert.ok(credentials.csrf, "second firm's own CSRF token required");
      observed.push({ case: name, ...await checkRequest(request, route, credentials, denyList, undefined,
        { emptyJobs: route.list && name.startsWith("d-"), sessionCase: route.list && !name.startsWith("d-"), nestCode }) });
    } catch (error) { throw new Error(`SX ${route.path} ${name}: ${error.message}`, { cause: error }); }
  }
  return observed;
}

/** Sign out once, then reuse the OLD cookies, including the practice token. */
export async function assertSignedOutBuilderRefuses({ request, signIn, routes, record = () => {} }) {
  for (const route of routes) assert.ok(await assertBuilderPositive({ request, signIn, route }));
  const builder = await signIn("builder");
  assert.equal(typeof signIn.revokeBuilder, "function", "guard the caller's cached signIn first");
  const response = await request("/api/auth/signout", { method: "POST", body: {}, cookies: builder.cookies, csrf: builder.csrfToken });
  assert.equal(response.status, 200, "real signout must succeed");
  signIn.revokeBuilder();
  for (const route of routes) {
    const result = await checkRequest(request, route, { cookies: builder.cookies }, financialDenyList, undefined, { sessionCase: route.list });
    record(route, { case: "c", ...result });
  }
  assert.throws(() => signIn("builder"), /cached builder revoked/u);
}

/** Capability pieces supply a REAL issued capability and its normal request
 * options. forbiddenPaths must include another job and another link/resource;
 * a fabricated capability is not evidence. No builder session may be supplied.
 * allowedDenyList names fields private to the builder on that capability's DTO
 * (an agreement may legitimately disclose its own agreed price).
 */
export async function assertCapabilityConfined(capability, {
  allowedPath, builderPaths, forbiddenPaths, allowedDenyList, denyList = financialDenyList, checkDatabase,
}) {
  const { request, value, options = {} } = capability;
  assert.ok(typeof request === "function" && typeof value === "string" && value.length, "issued capability required");
  assert.ok(!options.cookies && !new Headers(options.headers).has("cookie"), "capability requests must not carry builder cookies");
  assert.match(value, /^[A-Za-z0-9._~-]+$/u, "capability must be cookie-safe; send the original token unchanged");
  assert.ok(Array.isArray(allowedDenyList) && allowedDenyList.length, "capability-specific private fields required");
  assert.ok(builderPaths?.length, "builder routes required");
  assert.ok(forbiddenPaths?.some(route => route.kind === "other_job") &&
    forbiddenPaths.some(route => route.kind === "other_link"), "other-job and other-link proofs required");
  const allowed = await request(allowedPath, options);
  assert.equal(allowed.status, 200, "capability must first read its permitted resource");
  assertNoKeys(await allowed.json(), allowedDenyList);
  for (const route of forbiddenPaths) {
    assert.notEqual(route.path, allowedPath, "scope refusal must target a different resource");
    await checkRequest(request, route, options, denyList, checkDatabase);
  }
  for (const route of builderPaths) {
    const encoded = encodeURIComponent(value);
    for (const credentials of [
      { cookies: `jg_session=${value}` },
      { cookies: `capability=${value}` },
      { headers: { authorization: `Bearer ${value}`, "x-capability-token": value } },
      { query: true },
    ]) {
      const target = credentials.query
        ? { ...route, path: route.path + (route.path.includes("?") ? "&" : "?") + `token=${encoded}` }
        : route;
      await checkRequest(request, target, credentials.query ? {} : credentials, denyList, checkDatabase);
    }
  }
}
