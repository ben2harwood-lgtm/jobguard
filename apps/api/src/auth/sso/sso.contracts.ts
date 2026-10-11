import { z } from "zod";
import { proposedDecisionRecords, requireApprovedDecision, type DeploymentMode } from "@jobguard/config";

export const ssoErrorCodes = ["INVALID_SSO_INPUT", "SSO_ROUTE_BLOCKED", "SSO_NOT_FOUND", "SSO_FORBIDDEN", "SAML_REFUSED", "ASSERTION_REPLAY", "REQUEST_REFUSED", "DOMAIN_UNVERIFIED", "DOMAIN_CLAIMED", "LINK_REQUIRED", "LINK_FORBIDDEN", "MEMBERSHIP_REVOKED", "NO_MAPPED_GRANTS", "STALE_MAPPING", "SSO_UNAVAILABLE"] as const;
export class SsoError extends Error {
  constructor(readonly code: typeof ssoErrorCodes[number]) { super(code); this.name = "SsoError"; }
}
const nonempty = z.string().min(1).max(200);
const domain = z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+invalid$/u);
const scope = z.object({kind:z.enum(["tenant","region","branch","team"]),id:z.string().uuid()}).strict();
export const mappedRoles = ["admin","operative","supervisor","surveyor","commercial_manager","finance","read_only"] as const;
const adminBase = z.object({version:z.literal("sso-admin.v1"),requested_tenant_id:z.string().uuid()}).strict();
export const ssoAdminV1 = z.discriminatedUnion("action",[
  adminBase.extend({action:z.literal("connection.create"),id:z.string().uuid(),idpCert:z.string().min(100).max(8192).regex(/^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/u)}).strict(),
  adminBase.extend({action:z.literal("domain.verify"),connectionId:z.string().uuid(),domain,proof:z.string().min(1).max(400)}).strict(),
  adminBase.extend({action:z.literal("mapping.set"),connectionId:z.string().uuid(),group:nonempty,role:z.enum(mappedRoles),scope,expectedRevision:z.number().int().nonnegative(),enabled:z.boolean()}).strict(),
]).refine(input => input.action!=="mapping.set" || (input.role!=="finance" || input.scope.kind==="tenant"), {message:"finance is tenant scoped"});
export const ssoStartV1 = z.object({version:z.literal("sso-start.v1"),action:z.literal("signin"),linkExisting:z.boolean().optional()}).strict();
export const ssoCallbackV1 = z.object({version:z.literal("sso-callback.v1"),SAMLResponse:z.string().min(1).max(262144).regex(/^[A-Za-z0-9+/=\r\n]+$/u),relayState:z.string().regex(/^[A-Za-z0-9_-]{43}$/u)}).strict();
export const ssoConnectionIdV1 = z.string().uuid();
const regions = z.array(nonempty).min(1).max(20);
/** All provider-data-flow-v1 fields are mandatory; a complete record is still not approval. */
export const ssoDataFlowV1 = z.object({
  version:z.literal("sso-data-flow.v1"),provider:z.literal("in-process-test-idp"),feature:z.literal("saml-signin"),owner:nonempty,
  environment:z.literal("synthetic_demo"),dataCategories:regions,subjects:regions,purpose:nonempty,lawfulBasis:nonempty,
  controllerRole:nonempty,processorRole:nonempty,originRegions:regions,processingRegions:regions,storageRegions:regions,logRegions:regions,backupRegions:regions,
  endpoint:nonempty,deployment:nonempty,subprocessors:z.array(nonempty),retention:nonempty,training:z.literal("none"),deletion:nonempty,
  encryption:nonempty,credentialsClass:nonempty,direction:z.literal("local-inbound"),fallback:z.literal("deny"),d04Evidence:nonempty,d12Evidence:nonempty,
  reviewDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),gateStatus:z.literal("synthetic-only"),killSwitch:nonempty,verificationEvidence:regions,
}).strict();
export const ssoMetadataV1 = z.object({version:z.literal("sso-metadata.v1"),protocol:z.literal("saml2"),provider:z.literal("in-process-test-idp"),id:z.string().uuid(),tenantId:z.string().uuid(),idpEntityId:nonempty,spEntityId:nonempty,callbackUrl:z.string().url(),entryPoint:z.string().url(),idpCert:z.string().min(100).max(8192),sessionLimitSeconds:z.number().int().min(60).max(900),dataFlow:ssoDataFlowV1}).strict();
export type SsoMetadata = z.infer<typeof ssoMetadataV1>;
export type SsoAdminCommand = z.infer<typeof ssoAdminV1>;
/** Identity's legacy `production` label and missing/unknown configuration are denied modes. */
export function ssoDeploymentMode(raw:unknown):DeploymentMode {
  return raw==="synthetic_demo"?"synthetic_demo":raw==="pilot_no_charge"?"pilot_no_charge":"production_billing";
}
export function requireSyntheticSso(mode:DeploymentMode, provider:string, featureEnabled=true):void {
  // Reuse D04's existing gate; proposed policy can never authorize a real route.
  try { requireApprovedDecision(mode,"D04",proposedDecisionRecords.D04); }
  catch { throw new SsoError("SSO_ROUTE_BLOCKED"); }
  if(mode!=="synthetic_demo" || provider!=="in-process-test-idp" || !featureEnabled)throw new SsoError("SSO_ROUTE_BLOCKED");
}
export function syntheticSsoMetadata(id:string,tenantId:string,idpCert:string,origin:string):SsoMetadata {
  return ssoMetadataV1.parse({version:"sso-metadata.v1",protocol:"saml2",provider:"in-process-test-idp",id,tenantId,idpEntityId:`urn:jobguard:test-idp:${id}`,spEntityId:`urn:jobguard:sp:${id}`,callbackUrl:`${origin}/api/auth/sso/${id}/callback`,entryPoint:`${origin}/api/auth/sso/${id}/start`,idpCert,sessionLimitSeconds:900,
    dataFlow:{version:"sso-data-flow.v1",provider:"in-process-test-idp",feature:"saml-signin",owner:"synthetic-fixture-operator",environment:"synthetic_demo",dataCategories:["fictional-email","subject","groups","assertion"],subjects:["fictional-contractor-members"],purpose:"synthetic-signin",lawfulBasis:"no-real-personal-data",controllerRole:"synthetic-only",processorRole:"synthetic-only",originRegions:["application-process"],processingRegions:["application-process"],storageRegions:["configured-synthetic-postgresql"],logRegions:["redacted-application-process"],backupRegions:["no-live-backup-approval"],endpoint:`sso:${id}`,deployment:"synthetic-only",subprocessors:[],retention:"disposable-fixtures",training:"none",deletion:"dispose-synthetic-database",encryption:"opaque-session-keyed-digests",credentialsClass:"runtime-generated-test-public-key",direction:"local-inbound",fallback:"deny",d04Evidence:"proposed-no-approval",d12Evidence:"pending-no-real-data",reviewDate:"2026-10-11",gateStatus:"synthetic-only",killSwitch:"non-synthetic-mode-denied",verificationEvidence:["ENT-10a-synthetic-tests"]}});
}
export function ssoStatus(error:unknown):{code:string;status:number} {
  const code=error instanceof SsoError ? error.code : "SSO_UNAVAILABLE";
  return {code,status:code==="SSO_UNAVAILABLE"?503:code==="SSO_NOT_FOUND"?404:code==="STALE_MAPPING"?409:code==="INVALID_SSO_INPUT"||code==="SAML_REFUSED"?400:403};
}
export const ssoWorkerActionV1 = z.object({version:z.literal("sso-worker-action.v1"),connectionId:z.string().uuid(),sessionId:z.string().uuid(),membershipId:z.string().uuid(),permission:z.enum(["organisation.read","organisation.manage","client.invite","contract.read","contract.manage","job.read","extra.log","extra.price","extra.approve","dashboard.read","resident.read","data.export","data.import","statement.read"]),scopeId:z.string().uuid()}).strict();

export const ssoStateCookieOptions={httpOnly:true,secure:true,sameSite:"strict" as const,path:"/api/auth/sso",maxAge:600_000};
export const ssoSessionCookieOptions={httpOnly:true,secure:true,sameSite:"strict" as const,path:"/",maxAge:900_000};
export function ssoCookieState(cookie:string|undefined):string|undefined {return cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('jobguard_sso_state='))?.slice('jobguard_sso_state='.length);}
