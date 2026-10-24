import { describe, expect, it } from "vitest";
import { resolveVerifiedTenantContext } from "./principal-bridge.js";
import { identityStatus } from "./identity-http.js";
import type { AuthProvider } from "./auth-provider.js";
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

// These expectations include the pre-existing business refinements, not just URL syntax.
function expected(name: string, value: string): boolean {
  if (!URL.canParse(value)) return false;
  const parsed = new URL(value);
  if (name.startsWith("OIDC")) {
    if (value.length > 512 || parsed.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)+invalid$/u.test(parsed.hostname) || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return false;
    if (name.endsWith("issuer")) return parsed.origin === value;
  }
  if (name === "IDENTITY_DATABASE_URL") return /^postgres(?:ql)?:$/u.test(parsed.protocol) && decodeURIComponent(parsed.username) === "jobguard_identity";
  return true;
}

describe.each(boundaries)("Zod 3 URL compatibility: $name", ({ name, url, accepts }) => {
  const whitespace = [" ", "\t", "\r", "\n", "\u00a0", "\ufeff", "\v", "\f", "\u2003"];
  const inputs = [url, "not a url", "", ...whitespace.flatMap(w => [w + url, url + w, url.replace("://", `://${w}`), `${url}/path${w}segment`])];
  it.each(inputs)("retains the main result for %j", value => {
    let accepted = false;
    try { accepted = accepts(value); } catch { /* Existing refinements can throw on an invalid URL. */ }
    expect(accepted).toBe(expected(name, value));
  });
});

describe("principal bridge URL compatibility", () => {
  const provider = {} as AuthProvider; // Origin / missing-session rejection must precede provider access.
  const origins = [" https://app.builder.invalid", "https://app.builder.invalid ", "\thttps://app.builder.invalid", "https://app.builder.invalid\r", "https://app.builder.invalid\n", "https://app.builder.invalid/path\u00a0x", "https://app.builder.invalid/path\ufeffx"];
  it.each(origins)("keeps 403 ORIGIN_FORBIDDEN for %j and 401 without a session", async origin => {
    for (const sessionToken of ["s".repeat(32), undefined]) {
      try {
        await resolveVerifiedTenantContext(provider, { origin, ...(sessionToken ? { sessionToken } : {}) }, "https://app.builder.invalid");
        expect.fail("must reject before provider access");
      } catch (error) {
        expect(identityStatus(error)).toEqual(sessionToken ? { status: 403, code: "ORIGIN_FORBIDDEN" } : { status: 401, code: "UNAUTHENTICATED" });
      }
    }
  });
});
