import { describe, expect, it } from "vitest";
import { oidcConfigV1, oidcRequestV1, oidcClaimsV1 } from "./oidc.contracts.js";
import { fixtureConfig } from "./test-oidc-issuer.js";

describe("OIDC strict versioned contracts", () => {
  it("accepts the minimal synthetic configuration", () => expect(oidcConfigV1.parse(fixtureConfig)).toEqual(fixtureConfig));
  it.each([{ extra: true }, { mode: "production" }, { issuer: "https://example.com" }, { redirectUri: "https://app.com/callback" }, { issuer: "https://user@issuer.invalid" }, { issuer: "https://issuer.invalid/path" }])("refuses unsafe config %j", patch => expect(oidcConfigV1.safeParse({ ...fixtureConfig, ...patch }).success).toBe(false));
  it("requires a bounded request and no unknown keys", () => {
    const request = { version: "oidc-request.v1", tenantId: fixtureConfig.tenantId, connectionId: fixtureConfig.connectionId, issuer: fixtureConfig.issuer, clientId: fixtureConfig.clientId, redirectUri: fixtureConfig.redirectUri, state: "s".repeat(43), nonce: "n".repeat(43), verifier: "v".repeat(43), browserBinding: "b".repeat(43), createdAt: Date.now() };
    expect(oidcRequestV1.safeParse(request).success).toBe(true);
    for (const patch of [{ extra: true }, { state: "short" }, { verifier: "v".repeat(1000) }, { createdAt: -1 }]) expect(oidcRequestV1.safeParse({ ...request, ...patch }).success).toBe(false);
    expect(oidcRequestV1.safeParse({}).success).toBe(false);
  });
  it("accepts a minimal qualified proposal", () => {
    const claims = { version: "oidc-claims.v1", tenantId: fixtureConfig.tenantId, connectionId: fixtureConfig.connectionId, issuer: fixtureConfig.issuer, subject: "fictional", email: "person@builder.invalid", emailVerified: true, groups: [] };
    expect(oidcClaimsV1.safeParse(claims).success).toBe(true);
    for (const patch of [{ extra: true }, { emailVerified: false }, { email: "person@example.com" }, { subject: "x".repeat(257) }, { groups: Array(101).fill("site") }]) expect(oidcClaimsV1.safeParse({ ...claims, ...patch }).success).toBe(false);
  });
});
