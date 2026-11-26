import assert from "node:assert/strict";
import { test } from "node:test";
import { assertBuilderPositive, assertBuilderRouteRefuses, assertCapabilityConfined,
  assertSignedOutBuilderRefuses, bindBuilderRoutes, builderGetRoutes, guardCachedSignIn } from "./v2/test/refusals.mjs";

// Deterministic helper checks; real authorization is proved by the V2 seed suite.
const builder = { cookies: "jobguard_session=real; jg_session=practice", csrfToken: "csrf" };
const second = { signedIn: "jobguard_session=second", cookies: "jobguard_session=second; jg_session=second-practice",
  csrfToken: "second-csrf", realContext: { tenantId: "other-tenant" } };
const sessions = () => guardCachedSignIn(name => Promise.resolve(name === "builder" ? builder : second));
const route = { path: "/api/jobs/job", tenantId: "job-tenant", expect: body => assert.equal(body.job.id, "job") };
const refused = () => Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
function requests(refusal = refused, calls = []) {
  return async (path, options) => {
    calls.push({ path, ...options });
    return options.cookies === builder.cookies ? Response.json({ job: { id: "job" } }) : refusal(path, options);
  };
}
const check = request => assertBuilderRouteRefuses({ request, signIn: sessions(), route });

test("SX fixed list binds all ten GETs, retaining direct API transport", () => {
  const routes = bindBuilderRoutes({ jobId: "saved-id", tenantId: "practice-id" });
  // SX's ten stay first; later packets append their GET routes (rule 29), which are mandatory.
  assert.ok(builderGetRoutes.length >= 10);
  assert.ok(routes.every(route => !route.path.includes("{")));
  assert.deepEqual(routes.slice(8, 10).map(route => route.transport), ["api", "api"]);
  for (const route of routes.slice(10)) assert.equal(route.optional, undefined);
  assert.equal(routes[0].path, "/api/jobs?tenantId=practice-id");
  assert.equal(routes[9].optional, true);
  for (const route of routes.slice(0, 9)) assert.equal(route.optional, undefined);
});
test("SX runs positive first, then missing, two invalid values and both second-firm contexts", async () => {
  const calls = [];
  const observed = await check(requests(refused, calls));
  assert.equal(calls.length, 6);
  assert.equal(calls[0].cookies, builder.cookies);
  assert.equal(calls[1].cookies, undefined);
  assert.equal(calls[2].cookies, "jg_session=fictional-invalid; jobguard_session=fictional-invalid");
  assert.match(calls[3].cookies, /^jg_session=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}; jobguard_session=/u);
  assert.equal(calls[4].cookies, second.signedIn);
  assert.equal(calls[5].cookies, second.cookies);
  assert.deepEqual(observed.map(row => row.case), ["a", "b-format", "b-unknown-uuid", "d-real", "d-practice"]);
});
test("SX never counts universal refusals or a wrong positive body", async () => {
  for (const request of [async () => refused(), async () => Response.json({ job: { id: "wrong" } })]) {
    await assert.rejects(check(request), /planner miss/u);
  }
});
test("SX Nest d-real proves CSRF refusal then the tenant gate with the second firm's own token", async () => {
  const calls = [];
  const request = requests((_path, options) => options.cookies === second.signedIn
    ? Response.json({ code: options.csrf ? "TENANT_FORBIDDEN" : "ORIGIN_FORBIDDEN" }, { status: 403 })
    : refused(), calls);
  const observed = await assertBuilderRouteRefuses({ request, signIn: sessions(), route: { ...route, transport: "api" } });
  assert.deepEqual(calls.filter(call => call.cookies === second.signedIn).map(call => [call.csrf, call.tenantId]),
    [[undefined, undefined], [second.csrfToken, "job-tenant"]]);
  assert.deepEqual(observed.filter(row => row.case.startsWith("d-real")), [
    { case: "d-real-no-csrf", status: 403, code: "ORIGIN_FORBIDDEN" },
    { case: "d-real-csrf", status: 403, code: "TENANT_FORBIDDEN" },
  ]);
});
test("SX Nest d-real requires the exact status and code at each step and still checks leaks", async () => {
  for (const [csrf, status, body] of [
    [false, 403, { code: "TENANT_FORBIDDEN" }],
    [true, 403, { code: "ORIGIN_FORBIDDEN" }],
    [true, 401, { code: "TENANT_FORBIDDEN" }],
    [true, 403, { code: "SYNTHETIC_WORKFLOW_ONLY" }],
    [true, 403, { code: "FORBIDDEN" }],
    [true, 403, { code: "TENANT_FORBIDDEN", totalPence: 500 }],
    [false, 403, { code: "ORIGIN_FORBIDDEN", message: "£5" }],
  ]) {
    const request = requests((_path, options) => {
      if (options.cookies !== second.signedIn) return refused();
      return Boolean(options.csrf) === csrf ? Response.json(body, { status })
        : Response.json({ code: options.csrf ? "TENANT_FORBIDDEN" : "ORIGIN_FORBIDDEN" }, { status: 403 });
    });
    await assert.rejects(assertBuilderRouteRefuses({ request, signIn: sessions(), route: { ...route, transport: "api" } }),
      /exact Nest refusal|forbidden field|monetary value/u);
  }
});
test("SX Nest-only codes remain forbidden on web routes and other Nest cases", async () => {
  for (const code of ["ORIGIN_FORBIDDEN", "SYNTHETIC_WORKFLOW_ONLY"]) {
    await assert.rejects(check(requests(() => Response.json({ code }, { status: 403 }))), /allowed typed code/u);
    await assert.rejects(assertBuilderRouteRefuses({ request: requests(() => Response.json({ code }, { status: 403 })),
      signIn: sessions(), route: { ...route, transport: "api" } }), /allowed typed code/u);
  }
});
for (const status of [200, 400, 405, 500, 503]) {
  test(`SX rejects refusal status ${status}`, async () => {
    await assert.rejects(check(requests(() => Response.json({ code: "UNAUTHENTICATED" }, { status }))), /expected typed refusal/u);
  });
}
test("SX rejects HTML, missing codes and unknown codes", async () => {
  for (const refusal of [() => new Response("Not found", { status: 404 }),
    () => Response.json({}, { status: 401 }), () => Response.json({ code: "DATABASE_UNAVAILABLE" }, { status: 403 })]) {
    await assert.rejects(check(requests(refusal)), /typed JSON|allowed typed code/u);
  }
});
for (const code of ["UNAUTHENTICATED", "TENANT_FORBIDDEN", "FORBIDDEN", "NOT_FOUND"]) {
  test(`SX accepts typed ${code}`, async () => {
    await check(requests(() => Response.json({ code }, { status: 403 })));
  });
}
for (const extra of [
  { title: "private" }, { customer: {} }, { email: "private" }, { totalPence: 100 },
  { nested: [{ unitPricePence: 5 }] }, { finding: null }, { grossAmount: "secret" },
  { profit: null }, { margin: null }, { cost: null },
  { message: "£5" }, { message: "5.00" }, { message: "5 pence" }, { message: "5p" },
  { message: "GBP 5" }, { message: "500" }, { message: "balance 500" }, { nested: [500] },
]) {
  test(`SX rejects private fields and money: ${JSON.stringify(extra)}`, async () => {
    await assert.rejects(check(requests(() => Response.json({ code: "FORBIDDEN", ...extra }, { status: 403 }))),
      /forbidden field|numeric value|monetary value/u);
  });
}
test("SX refuses jobs[0] even without named private fields", async () => {
  await assert.rejects(check(requests(() => Response.json({ code: "FORBIDDEN", jobs: [{}] }, { status: 403 }))), /jobs\[0\]/u);
});
test("SX jobs: [] exception applies only to the second firm", async () => {
  const list = { ...route, list: true };
  await assertBuilderRouteRefuses({ signIn: sessions(), route: list, request: requests((_path, options) =>
    options.cookies?.includes("second") ? Response.json({ version: 1, jobs: [] }) : refused()) });
  await assert.rejects(assertBuilderRouteRefuses({ signIn: sessions(), route: list,
    request: requests(() => Response.json({ version: 1, jobs: [] })) }), /expected typed refusal/u);
  await assert.rejects(assertBuilderRouteRefuses({ signIn: sessions(), route: list,
    request: requests(() => Response.json({ code: "NOT_FOUND" }, { status: 404 })) }), /expected typed refusal/u);
});
test("SX optional illustration may be dropped explicitly; mandatory positives may not", async () => {
  const request = async () => refused();
  assert.equal(await assertBuilderPositive({ request, signIn: sessions(), route: { ...route, optional: true } }), false);
  await assert.rejects(assertBuilderPositive({ request, signIn: sessions(), route }), /planner miss/u);
});
test("SX GET inventory does not accept POST", async () => {
  await assert.rejects(assertBuilderRouteRefuses({ request: requests(), signIn: sessions(), route: { ...route, method: "POST" } }), /GET only/u);
});
test("SX signs out once and replays OLD cookies on every registered route, then guards cache", async () => {
  const signIn = sessions();
  const calls = [];
  let ended = false;
  const request = async (path, options) => {
    calls.push({ path, ...options });
    if (path === "/api/auth/signout") { ended = true; return Response.json({}); }
    assert.equal(options.cookies, builder.cookies);
    return ended ? refused() : Response.json({ job: { id: "job" } });
  };
  const observed = [];
  await assertSignedOutBuilderRefuses({ request, signIn, routes: [route, { ...route, path: "/jobs/job", transport: "api" }],
    record: (_route, result) => observed.push(result) });
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  assert.equal(calls[2].csrf, builder.csrfToken);
  assert.deepEqual(observed, [{ case: "c", status: 401, code: "UNAUTHENTICATED" }, { case: "c", status: 401, code: "UNAUTHENTICATED" }]);
  assert.throws(() => signIn("builder"), /cached builder revoked/u);
  assert.equal(await signIn("second-builder"), second);
});
test("SX refuses a still-usable signed-out practice cookie without hiding the defect", async () => {
  const signIn = sessions();
  await assert.rejects(assertSignedOutBuilderRefuses({ request: requests(), signIn, routes: [route] }), /expected typed refusal/u);
  assert.throws(() => signIn("builder"), /cached builder revoked/u);
});

const capabilityOptions = {
  allowedPath: "/customer/job-x/link-y", allowedDenyList: ["profit", "margin", "finding"],
  forbiddenPaths: [{ kind: "other_job", path: "/customer/job-z/link-y" }, { kind: "other_link", path: "/customer/job-x/link-w" }],
  builderPaths: [{ path: "/api/jobs/job-x/quotes" }],
};
test("SX real capability proves allowed read, both scope refusals, and all builder transports", async () => {
  const calls = [];
  const value = "issued-capability";
  await assertCapabilityConfined({ value, request: async (path, options) => {
    calls.push({ path, ...options });
    return path === capabilityOptions.allowedPath ? Response.json({ agreement: "agreed", amount: "5.00" }) : refused();
  } }, capabilityOptions);
  assert.equal(calls.length, 7);
  assert.equal(calls[3].cookies, `jg_session=${value}`);
  assert.equal(calls[4].cookies, `capability=${value}`);
  assert.equal(calls[5].headers.authorization, `Bearer ${value}`);
  assert.equal(calls[6].path, `/api/jobs/job-x/quotes?token=${value}`);
});
test("SX rejects invalid capabilities, leaked private fields and incomplete scope checks", async () => {
  await assert.rejects(assertCapabilityConfined({ value: "token", request: async () => refused() }, capabilityOptions), /permitted resource/u);
  await assert.rejects(assertCapabilityConfined({ value: "token", request: async () => Response.json({ profit: "secret" }) }, capabilityOptions), /forbidden field/u);
  await assert.rejects(assertCapabilityConfined({ value: "token", request: async () => refused() }, { ...capabilityOptions, forbiddenPaths: [] }), /other-job and other-link/u);
  await assert.rejects(assertCapabilityConfined({ value: "token", request: async () => refused(), options: { cookies: "builder" } }, capabilityOptions), /builder cookies/u);
});
test("SX capability POST refusals preserve database state, including when the response leaks", async () => {
  let revision = 0;
  await assert.rejects(assertCapabilityConfined({ value: "token", request: async path => {
    if (path === capabilityOptions.allowedPath) return Response.json({});
    revision++;
    return refused();
  } }, { ...capabilityOptions, forbiddenPaths: capabilityOptions.forbiddenPaths.map(route => ({ ...route, method: "POST" })),
    checkDatabase: async () => ({ count: 1, revision }) }), /changed database state/u);
});
