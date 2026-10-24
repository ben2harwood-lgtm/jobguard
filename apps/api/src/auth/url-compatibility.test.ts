import { describe, expect, it } from "vitest";
import { parseIdentityEnvironment } from "@jobguard/config";
import { tenantRequestCredentialsV1 } from "./auth-schemas.js";
import { oidcConfigV1, oidcRequestV1, oidcClaimsV1 } from "./sso/oidc.contracts.js";
import { fixtureConfig } from "./sso/test-oidc-issuer.js";
import { syntheticSsoMetadata, ssoMetadataV1 } from "./sso/sso.contracts.js";

const origin = "https://app.builder.invalid";
const metadata = syntheticSsoMetadata(fixtureConfig.connectionId, fixtureConfig.tenantId, "x".repeat(100), origin);
const request = { ...fixtureConfig, version: "oidc-request.v1", state: "s".repeat(43), nonce: "n".repeat(43), verifier: "v".repeat(43), browserBinding: "b".repeat(43), createdAt: 0 };
const { mode: _mode, provider: _provider, ...requestFields } = request;
const claims = { version: "oidc-claims.v1", tenantId: fixtureConfig.tenantId, connectionId: fixtureConfig.connectionId, issuer: fixtureConfig.issuer, subject: "fictional", email: "person@builder.invalid", emailVerified: true, groups: [] };
const environment = { JOBGUARD_ENV: "synthetic_demo", IDENTITY_DATABASE_URL: "postgres://jobguard_identity:fake@db.invalid/identity", AUTH_CODE_SECRET: "s".repeat(32), AUTH_ALLOWED_ORIGIN: origin };
const boundaries = [
  { name: "tenant origin", url: origin, accepts: (url: string) => tenantRequestCredentialsV1.safeParse({ origin: url }).success },
  ...["issuer", "redirectUri"].flatMap(key => [
    { name: `OIDC config ${key}`, url: fixtureConfig[key as "issuer" | "redirectUri"], accepts: (url: string) => oidcConfigV1.safeParse({ ...fixtureConfig, [key]: url }).success },
    { name: `OIDC request ${key}`, url: fixtureConfig[key as "issuer" | "redirectUri"], accepts: (url: string) => oidcRequestV1.safeParse({ ...requestFields, [key]: url }).success },
  ]),
  { name: "OIDC claims issuer", url: fixtureConfig.issuer, accepts: (url: string) => oidcClaimsV1.safeParse({ ...claims, issuer: url }).success },
  ...["callbackUrl", "entryPoint"].map(key => ({ name: `SSO ${key}`, url: metadata[key as "callbackUrl" | "entryPoint"], accepts: (url: string) => ssoMetadataV1.safeParse({ ...metadata, [key]: url }).success })),
  ...["AUTH_ALLOWED_ORIGIN", "IDENTITY_DATABASE_URL"].map(key => ({ name: key, url: environment[key as "AUTH_ALLOWED_ORIGIN" | "IDENTITY_DATABASE_URL"], accepts: (url: string) => { try { parseIdentityEnvironment({ ...environment, [key]: url }); return true; } catch { return false; } } })),
];

describe.each(boundaries)("URL compatibility: $name", ({ url, accepts }) => {
  it("preserves a valid URL verbatim", () => expect(accepts(url)).toBe(true));
  it.each([" ", "\t", "\r", "\n", "\u00a0", "\ufeff", "\v", "\f", "\u2003"])("rejects edge whitespace %j before URL normalization", whitespace => {
    expect(accepts(whitespace + url)).toBe(false);
    expect(accepts(url + whitespace)).toBe(false);
  });
  it.each(["\t", "\r", "\n", "\u00a0", "\ufeff"])("rejects embedded %j before URL normalization", whitespace => {
    expect(accepts(url.replace("://", `://${whitespace}`))).toBe(false);
    expect(accepts(`${url}/path${whitespace}segment`)).toBe(false);
  });
});
