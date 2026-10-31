/** PostgreSQL/local-issuer fixtures; dispatcher CI only, no external IdP. */
import { randomUUID } from "node:crypto";
import { OidcRepository } from "../src/oidc-repository.js";
import { OidcApplication } from "../../../apps/api/src/auth/sso/oidc.application.js";
import { TestOidcIssuer, fixtureConfig } from "../../../apps/api/src/auth/sso/test-oidc-issuer.js";
import { fixture, origin, type ScimHarness } from "./scim-fixtures.js";
export { createScimHarness, canonicalRows, origin, auditRows } from "./scim-fixtures.js";
export async function oidcFixture(h:ScimHarness,verify=true) {
 const f=await fixture(h,false,false),issuer=new TestOidcIssuer(),repository=new OidcRepository(h.identity);
 const app=new OidcApplication(h.provider,repository,origin,'synthetic_demo',issuer);
 const config={version:'oidc-connection.v1',protocol:'oidc',revision:1,sessionLimitSeconds:900,config:{...fixtureConfig,tenantId:f.principal.tenantId,connectionId:f.connectionId}};
 await app.admin({version:'oidc-admin.v1',action:'connection.create',requested_tenant_id:f.principal.tenantId,connection:config},f.ordinary);
 if(verify)await h.sso.admin({version:'sso-admin.v1',action:'domain.verify',requested_tenant_id:f.principal.tenantId,connectionId:f.connectionId,domain:f.domain,proof:`synthetic-domain:${f.connectionId}:${f.domain}`},f.ordinary);
 await f.map('admin');
 issuer.claims={sub:randomUUID(),email:`person@${f.domain}`,groups:['admin']};
 const start=(linkExisting=false)=>app.start(f.connectionId,{version:'oidc-start.v1',action:'signin',linkExisting},f.ordinary);
 const callback=(s:Awaited<ReturnType<typeof start>>,application=app)=>application.callback(f.connectionId,{version:'oidc-callback.v1',callback:s.callback},s.browser,origin);
 return {...f,issuer,repository,oidc:app,config,start,callback};
}
