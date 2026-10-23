import { z } from "zod";

const fictionalUrl = z.string().max(512).url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && /^(?:[a-z0-9-]+\.)+invalid$/u.test(url.hostname) && !url.username && !url.password && !url.port && !url.search && !url.hash;
});
const issuer = fictionalUrl.refine(value => new URL(value).origin === value);
const binding = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
export const oidcConfigV1 = z.object({
  version: z.literal("oidc-config.v1"), mode: z.literal("synthetic_demo"), provider: z.literal("in-process-test-idp"),
  tenantId: z.guid({ error: "Invalid uuid" }), connectionId: z.guid({ error: "Invalid uuid" }), issuer,
  clientId: z.string().min(1).max(200), redirectUri: fictionalUrl,
}).strict();
export const oidcRequestV1 = z.object({
  version: z.literal("oidc-request.v1"), tenantId: z.guid({ error: "Invalid uuid" }), connectionId: z.guid({ error: "Invalid uuid" }), issuer,
  clientId: z.string().min(1).max(200), redirectUri: fictionalUrl,
  state: binding, nonce: binding, verifier: binding, browserBinding: binding,
  createdAt: z.number().int().nonnegative().safe(),
}).strict();
export const oidcClaimsV1 = z.object({
  version: z.literal("oidc-claims.v1"), tenantId: z.guid({ error: "Invalid uuid" }), connectionId: z.guid({ error: "Invalid uuid" }), issuer,
  subject: z.string().min(1).max(256),
  email: z.email({ error: "Invalid email" }).max(320).refine(value => /@(?:[a-z0-9-]+\.)+invalid$/u.test(value)),
  emailVerified: z.literal(true), groups: z.array(z.string().min(1).max(256)).max(100),
}).strict();
export type OidcConfig = z.infer<typeof oidcConfigV1>;
export type OidcRequest = z.infer<typeof oidcRequestV1>;
export type OidcClaims = z.infer<typeof oidcClaimsV1>;
/** Deliberately excludes upstream error text, causes, URLs, tokens and claims. */
export class OidcError extends Error {
  readonly version = "oidc-error.v1";
  readonly code = "OIDC_REFUSED";
  constructor() { super("OIDC_REFUSED"); this.name = "OidcError"; }
}
