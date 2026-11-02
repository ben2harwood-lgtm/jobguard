import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { IdentityApplication } from "./identity.application.js";
import { cookieToken, type IdentityHttpRequest } from "./identity-http.js";

export const CUSTOMER_APPLICATION = "CUSTOMER_APPLICATION";
export const customerCookieName = "jobguard_customer";
export const customerCookieOptions = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" };
export const customerActions = ["issue", "revoke", "signin", "signout", "read"] as const;
export type CustomerAction = typeof customerActions[number];
const uuid = z.guid().transform(value => value.toLowerCase());
const scope = { tenantId: uuid, jobId: uuid, customerId: uuid };
const issue = z.object({ version: z.literal("customer-link-issue.v1"), ...scope }).strict();
const revoke = z.object({ version: z.literal("customer-link-revoke.v1"), tenantId: uuid, jobId: uuid, grantId: uuid }).strict();
const signin = z.object({ version: z.literal("customer-signin.v1"), ...scope, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) }).strict();
const read = z.object({ version: z.literal("customer-read.v1"), jobId: uuid }).strict();
const signout = z.object({ version: z.literal("customer-signout.v1") }).strict();
const credential = z.tuple([uuid, uuid, uuid, z.string().regex(/^[A-Za-z0-9_-]{43}$/u)]);
export class CustomerRefused extends Error { readonly code = "CUSTOMER_REFUSED"; }
export function customerToken(request: IdentityHttpRequest): string | undefined {
  return request.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(`${customerCookieName}=`))?.slice(customerCookieName.length + 1);
}
/** One application boundary shared by direct Nest and Next. Customer credentials never mint a member principal. */
export class CustomerSigninApplication {
  constructor(private readonly identity: IdentityApplication, private readonly environment: string | undefined) {}
  private async query<T>(sql: string, values: unknown[]): Promise<T> {
    return (await this.identity.provider.repository.pool.query<{ result: T }>(sql, values)).rows[0]!.result;
  }
  async run(action: CustomerAction, raw: unknown, request: IdentityHttpRequest): Promise<{ body: unknown; cookie?: string; clearCookie?: true }> {
    try {
      if (this.environment !== "synthetic_demo" || request.headers.origin !== this.identity.allowedOrigin || request.headers["x-tenant-id"]) throw new CustomerRefused();
      if (action === "issue" || action === "revoke") {
        if (customerToken(request) !== undefined) throw new CustomerRefused();
        const input = action === "issue" ? issue.parse(raw) : revoke.parse(raw);
        const token = cookieToken(request);
        await this.identity.context({ sessionToken: token, requestedTenantId: input.tenantId, origin: request.headers.origin, csrfToken: request.headers["x-csrf-token"] });
        const builderDigest = this.identity.provider.digest(`session:${token}`);
        if ("customerId" in input) {
          const secret = randomBytes(32).toString("base64url");
          const path = `/customer/sign-in#${input.tenantId}/${input.jobId}/${input.customerId}/${secret}`;
          const id = await this.query<string>("SELECT identity.customer_portal_issue($1,$2,$3,$4,$5,$6) result", [input.tenantId, builderDigest, input.jobId, input.customerId, this.identity.provider.digest(`customer-link:${secret}`), path]);
          return { body: { version: "customer-link-issued.v1", grantId: id } };
        }
        await this.query("SELECT identity.customer_portal_revoke($1,$2,$3,$4) result", [input.tenantId, builderDigest, input.jobId, input.grantId]);
        return { body: { version: "customer-link-revoked.v1" } };
      }
      if (action === "signin") {
        const input = signin.parse(raw);
        const token = `${input.tenantId}.${input.jobId}.${input.customerId}.${randomBytes(32).toString("base64url")}`;
        await this.query("SELECT identity.customer_portal_use($1,$2,$3,$4,$5,'redeem') result", [input.tenantId, input.jobId, input.customerId, this.identity.provider.digest(`customer-link:${input.token}`), this.identity.provider.digest(`customer-session:${token}`)]);
        return { body: { version: "customer-signed-in.v1" }, cookie: token };
      }
      const input = action === "read" ? read.parse(raw) : signout.parse(raw);
      const token = customerToken(request);
      const [tenantId, jobId, customerId] = credential.parse(token?.split("."));
      // Do not look up the requested job at all when it differs from the cookie's bound job.
      if ("jobId" in input && input.jobId !== jobId) throw new CustomerRefused();
      const body = await this.query("SELECT identity.customer_portal_use($1,$2,$3,$4,NULL,$5) result", [tenantId, jobId, customerId, this.identity.provider.digest(`customer-session:${token}`), action === "read" ? "resolve" : "signout"]);
      return action === "signout" ? { body: { version: "customer-signed-out.v1" }, clearCookie: true } : { body };
    } catch (error) {
      // Credential state, foreign scope, schema failures and unknown resources have one public refusal.
      if (error instanceof CustomerRefused || error instanceof z.ZodError || (error as { code?: string })?.code === "42501" || (error as { code?: string })?.code === "UNAUTHENTICATED" || (error as { code?: string })?.code === "TENANT_FORBIDDEN" || (error as { code?: string })?.code === "ORIGIN_FORBIDDEN") throw new CustomerRefused();
      throw error;
    }
  }
}
export const customerRefusal = (error: unknown) => ({ status: error instanceof CustomerRefused || error instanceof SyntaxError ? 401 : 503, body: { code: error instanceof CustomerRefused || error instanceof SyntaxError ? "CUSTOMER_REFUSED" : "CUSTOMER_UNAVAILABLE" } });
export async function customerHttp(application: CustomerSigninApplication | (() => CustomerSigninApplication), action: CustomerAction, request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    const service = typeof application === "function" ? application() : application;
    const result = await service.run(action, await request.json(), { headers: Object.fromEntries(request.headers.entries()) });
    const response = Response.json(result.body, { headers });
    if (result.cookie) response.headers.set("Set-Cookie", `${customerCookieName}=${result.cookie}; Path=/; HttpOnly; Secure; SameSite=Strict`);
    if (result.clearCookie) response.headers.set("Set-Cookie", `${customerCookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    return response;
  } catch (error) { const failure = customerRefusal(error); return Response.json(failure.body, { status: failure.status, headers }); }
}
