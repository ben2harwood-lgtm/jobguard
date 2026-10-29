import { describe, expect, it } from "vitest";
import { OidcAdapter } from "./oidc.js";
import { fixtureConfig, TestOidcIssuer } from "./test-oidc-issuer.js";

const browser = "b".repeat(43);
async function setup() {
  const issuer = new TestOidcIssuer();
  const adapter = new OidcAdapter(fixtureConfig, issuer.transport);
  const start = await adapter.start(browser);
  return { issuer, adapter, ...start };
}
describe("local library-backed OIDC", () => {
  it("validates a signed PKCE flow and returns only a qualified proposal", async () => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    const url = new URL(authorizationUrl);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email groups");
    expect(url.searchParams.has("code_verifier")).toBe(false);
    const proposal = await adapter.validate(issuer.authorize(authorizationUrl), request, browser);
    expect(proposal).toEqual({ version: "oidc-claims.v1", tenantId: fixtureConfig.tenantId, connectionId: fixtureConfig.connectionId, issuer: fixtureConfig.issuer, subject: "fictional-person", email: "person@builder.invalid", emailVerified: true, groups: ["site"] });
    expect(issuer.calls).toContain(`${fixtureConfig.issuer}/jwks`);
  });
  it("refuses a consumed authorization code replay at the fixture issuer", async () => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    const callback = issuer.authorize(authorizationUrl);
    await adapter.validate(callback, request, browser);
    await expect(adapter.validate(callback, request, browser)).rejects.toThrow("OIDC_REFUSED");
    expect(issuer.calls.filter(url => url.endsWith("/token"))).toHaveLength(2);
    // This proves protocol handling only; durable request consumption belongs to slice B.
  });
  it("accepts at most one concurrent exchange of the same fixture code", async () => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    const callback = issuer.authorize(authorizationUrl);
    const outcomes = await Promise.allSettled([
      adapter.validate(callback, request, browser), adapter.validate(callback, request, browser),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const refused = outcomes.find(result => result.status === "rejected");
    expect(refused).toMatchObject({ status: "rejected", reason: { code: "OIDC_REFUSED" } });
  });
  it("refuses another company's stored request before transport", async () => {
    const { issuer, request, authorizationUrl } = await setup();
    const otherCompany = new OidcAdapter({ ...fixtureConfig, tenantId: "33333333-3333-4333-8333-333333333333" }, issuer.transport);
    const calls = issuer.calls.length;
    await expect(otherCompany.validate(issuer.authorize(authorizationUrl), request, browser)).rejects.toThrow("OIDC_REFUSED");
    expect(issuer.calls).toHaveLength(calls);
  });
  it("refuses a callback swapped between two companies' valid requests", async () => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    const otherCompany = new OidcAdapter({ ...fixtureConfig, tenantId: "33333333-3333-4333-8333-333333333333" }, issuer.transport);
    const other = await otherCompany.start(browser);
    const calls = issuer.calls.length;
    const callback = issuer.authorize(authorizationUrl);
    await expect(otherCompany.validate(callback, other.request, browser)).rejects.toThrow("OIDC_REFUSED");
    expect(issuer.calls).toHaveLength(calls);
    // The original request can still complete; the failed cross-company attempt consumed no code.
    await expect(adapter.validate(callback, request, browser)).resolves.toHaveProperty("tenantId", fixtureConfig.tenantId);
  });
  it("keeps privileged groups as data and discards provider authority claims", async () => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    issuer.claims = {
      tenantId: "33333333-3333-4333-8333-333333333333", connectionId: "33333333-3333-4333-8333-333333333333",
      role: "owner", permissions: ["*"], session: "invented", groups: ["owner", "finance", "commercial_manager"],
    };
    const proposal = await adapter.validate(issuer.authorize(authorizationUrl), request, browser);
    expect(proposal).toEqual({
      version: "oidc-claims.v1", tenantId: fixtureConfig.tenantId, connectionId: fixtureConfig.connectionId,
      issuer: fixtureConfig.issuer, subject: "fictional-person", email: "person@builder.invalid", emailVerified: true,
      groups: ["owner", "finance", "commercial_manager"],
    });
  });
  it.each([
    { iss: "https://other.invalid" }, { aud: "other" }, { nonce: "other" }, { exp: 1 }, { iat: 9999999999 }, { nbf: 9999999999 }, { nonce: null },
    { email_verified: false }, { email: "person@example.com" }, { sub: "" }, { groups: Array(101).fill("site") },
  ])("refuses signed invalid claims %j", async claims => {
    const { issuer, adapter, request, authorizationUrl } = await setup(); issuer.claims = claims;
    await expect(adapter.validate(issuer.authorize(authorizationUrl), request, browser)).rejects.toMatchObject({ code: "OIDC_REFUSED", message: "OIDC_REFUSED" });
  });
  it.each(["unsigned", "altered", "unknownKey"] as const)("refuses %s token", async field => {
    const { issuer, adapter, request, authorizationUrl } = await setup(); issuer[field] = true;
    await expect(adapter.validate(issuer.authorize(authorizationUrl), request, browser)).rejects.toThrow("OIDC_REFUSED");
  });
  it.each(["state", "redirect", "duplicate", "duplicate-state", "duplicate-issuer", "extra", "fragment", "issuer"])("refuses callback %s before exchange", async kind => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    const callback = new URL(issuer.authorize(authorizationUrl));
    if (kind === "state") callback.searchParams.set("state", "wrong");
    if (kind === "redirect") callback.pathname = "/wrong";
    if (kind === "duplicate") callback.searchParams.append("code", "extra");
    if (kind === "duplicate-state") callback.searchParams.append("state", request.state);
    if (kind === "duplicate-issuer") callback.searchParams.append("iss", request.issuer);
    if (kind === "extra") callback.searchParams.set("unexpected", "extra");
    if (kind === "fragment") callback.hash = "secret";
    if (kind === "issuer") callback.searchParams.set("iss", "https://other.invalid");
    await expect(adapter.validate(callback.href, request, browser)).rejects.toThrow("OIDC_REFUSED");
    expect(issuer.calls.filter(x => x.endsWith("/token"))).toHaveLength(0);
  });
  it.each(["browser", "tenant", "connection", "pkce", "expired", "future", "issuer", "client", "redirect", "unsolicited"])("refuses request %s", async kind => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    const changed = { ...request };
    if (kind === "tenant") changed.tenantId = "33333333-3333-4333-8333-333333333333";
    if (kind === "connection") changed.connectionId = "33333333-3333-4333-8333-333333333333";
    if (kind === "pkce") changed.verifier = "x".repeat(43);
    if (kind === "expired") changed.createdAt = 1;
    if (kind === "future") changed.createdAt = Date.now() + 60000;
    if (kind === "issuer") changed.issuer = "https://other.invalid";
    if (kind === "client") changed.clientId = "other";
    if (kind === "redirect") changed.redirectUri = "https://app.invalid/other";
    await expect(adapter.validate(issuer.authorize(authorizationUrl), kind === "unsolicited" ? {} : changed, kind === "browser" ? "x".repeat(43) : browser)).rejects.toThrow("OIDC_REFUSED");
  });
  it("generates independent unpredictable state, nonce and verifier", async () => {
    const { adapter, request } = await setup();
    const next = await adapter.start(browser);
    for (const field of ["state", "nonce", "verifier"] as const) {
      expect(request[field]).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(next.request[field]).not.toBe(request[field]);
    }
    expect(new Set([request.state, request.nonce, request.verifier]).size).toBe(3);
  });
  it.each(["/token", "/jwks"])("bounds streamed bodies and calls at %s", async endpoint => {
    const issuer = new TestOidcIssuer();
    const adapter = new OidcAdapter(fixtureConfig, async (url, options) => url.endsWith(endpoint)
      ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); } }))
      : issuer.transport(url, options));
    const { authorizationUrl, request } = await adapter.start(browser);
    await expect(adapter.validate(issuer.authorize(authorizationUrl), request, browser)).rejects.toThrow("OIDC_REFUSED");
    expect(issuer.calls.filter(url => url.endsWith("/token")).length).toBeLessThanOrEqual(1);
  });
  it("bounds a stalled response body", async () => {
    const adapter = new OidcAdapter(fixtureConfig, async () => new Response(new ReadableStream()));
    await expect(adapter.start(browser)).rejects.toThrow("OIDC_REFUSED");
  });
  it("requires a fresh sign-in after an unknown exchange outcome without retry", async () => {
    const issuer = new TestOidcIssuer(); let attempts = 0;
    const adapter = new OidcAdapter(fixtureConfig, async (url, options) => {
      if (url.endsWith("/token")) { attempts++; await issuer.transport(url, options); throw new Error("unknown private outcome"); }
      return issuer.transport(url, options);
    });
    const { authorizationUrl, request } = await adapter.start(browser);
    await expect(adapter.validate(issuer.authorize(authorizationUrl), request, browser)).rejects.toThrow("OIDC_REFUSED");
    expect(attempts).toBe(1);
  });
  it("accepts newly rotated signing keys", async () => {
    const { issuer, adapter, request, authorizationUrl } = await setup();
    await adapter.validate(issuer.authorize(authorizationUrl), request, browser);
    issuer.rotate();
    const next = await adapter.start(browser);
    await expect(adapter.validate(issuer.authorize(next.authorizationUrl), next.request, browser)).resolves.toHaveProperty("subject", "fictional-person");
  });
  it.each(["token_endpoint", "jwks_uri", "authorization_endpoint"])("refuses escaped discovery %s", async field => {
    const issuer = new TestOidcIssuer(); issuer.discovery[field] = "https://evil.invalid/escape";
    await expect(new OidcAdapter(fixtureConfig, issuer.transport).start(browser)).rejects.toThrow("OIDC_REFUSED");
    expect(issuer.calls).toHaveLength(1);
  });
  it("bounds timeout even if the local handler ignores abort", async () => {
    await expect(new OidcAdapter(fixtureConfig, async () => new Promise(() => {})).start(browser)).rejects.toThrow("OIDC_REFUSED");
  });
  it.each(["oversize", "redirect", "exception"])("redacts transport %s failures", async kind => {
    const adapter = new OidcAdapter(fixtureConfig, async () => {
      if (kind === "exception") throw new Error("private-code-verifier-token-email");
      return kind === "redirect" ? new Response(null, { status: 302, headers: { location: "https://example.com" } }) : new Response("x".repeat(65537));
    });
    const failure: unknown = await adapter.start(browser).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: "OIDC_REFUSED", code: "OIDC_REFUSED" });
    expect(failure).not.toHaveProperty("cause");
    expect(JSON.stringify(failure)).not.toContain("private-code-verifier-token-email");
  });
});
