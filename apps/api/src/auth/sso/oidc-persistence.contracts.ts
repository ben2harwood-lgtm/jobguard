import { z } from "zod";
import { oidcConfigV1 } from "./oidc.contracts.js";

/** Fixed in-process registration. These URLs are protocol identifiers, never network destinations. */
export const oidcConnectionV1 = z.object({
 version:z.literal("oidc-connection.v1"),protocol:z.literal("oidc"),revision:z.literal(1),
 sessionLimitSeconds:z.number().int().min(60).max(900),
 config:oidcConfigV1.refine(c=>c.issuer==="https://issuer.invalid" && c.clientId==="jobguard-practice" && c.redirectUri==="https://app.invalid/oidc/callback"),
}).strict();
export type OidcConnection = z.infer<typeof oidcConnectionV1>;
export const oidcStartV1=z.object({version:z.literal("oidc-start.v1"),action:z.literal("signin"),linkExisting:z.boolean().optional()}).strict();
export const oidcCallbackV1=z.object({version:z.literal("oidc-callback.v1"),callback:z.string().url().max(4096)}).strict();
export const oidcAdminV1=z.object({version:z.literal("oidc-admin.v1"),action:z.literal("connection.create"),requested_tenant_id:z.string().uuid(),connection:oidcConnectionV1}).strict().refine(p=>p.requested_tenant_id===p.connection.config.tenantId);
export const oidcCookieOptions={httpOnly:true,secure:true,sameSite:"strict" as const,path:"/api/auth/oidc",maxAge:300};
export function oidcBrowserCookie(cookie:string|undefined):string|undefined {
 const values=cookie?.split(";").map(x=>x.trim()).filter(x=>x.startsWith("jobguard_oidc_state="));
 return values?.length===1?values[0]!.slice("jobguard_oidc_state=".length):undefined;
}
