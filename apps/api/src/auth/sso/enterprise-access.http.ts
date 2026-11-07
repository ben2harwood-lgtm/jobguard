import { z } from 'zod';
import { EnterpriseAccessRepository } from '@jobguard/db';
import type { DeploymentMode } from '@jobguard/config';
import type { AuthProvider } from '../auth-provider.js';
import type { PersistedAuthProvider } from '../persisted-auth-provider.js';
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from '../principal-bridge.js';
import { EnterpriseAccessApplication } from './enterprise-access.application.js';
import { emergencyCommandV1 } from './enterprise-access.contracts.js';
import { requireSyntheticSso } from './sso.contracts.js';
const envelope=z.object({version:z.literal('emergency-route.v1'),requested_tenant_id:z.guid(),command:emergencyCommandV1}).strict();
const operations=['request','approve','open','inspect','revoke_member'];
/** Shared Next POST transport; no caller-supplied context, actor, role or session digest. */
export async function emergencyOwnerPost(request:Request,operation:string,credentials:TenantRequestCredentials,
 base:PersistedAuthProvider,allowedOrigin:string,mode:DeploymentMode):Promise<Response> {
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 try {
  requireSyntheticSso(mode,'in-process-test-idp');
  if(request.method!=='POST'||!operations.includes(operation))return reply({code:'SSO_EMERGENCY_REFUSED'},403);
  const input=envelope.parse(await request.json());
  if(input.command.operation!==operation)return reply({code:'SSO_EMERGENCY_REFUSED'},403);
  // Membership reads here must not append the ordinary sign-in provider's refusal log.
  // SQL rechecks the same live owner/session under lock before any emergency write.
  const ownerProvider:AuthProvider={
   authenticate:base.authenticate.bind(base),requestCode:base.requestCode.bind(base),verifyCode:base.verifyCode.bind(base),
   findMembership:async(principal,tenantId)=>(await base.memberships(principal)).find(m=>m.tenantId===tenantId&&m.role==='owner'),
  };
  const context=await resolveVerifiedTenantContext(ownerProvider,{...credentials,requestedTenantId:input.requested_tenant_id},allowedOrigin);
  if(!credentials.sessionToken||!credentials.csrfToken)return reply({code:'SSO_EMERGENCY_REFUSED'},403);
  const repository=new EnterpriseAccessRepository(base.repository.pool,base.repository.pool);
  const application=new EnterpriseAccessApplication(repository,mode);
  return reply(await application.emergency(context,{sessionDigest:base.digest(`session:${credentials.sessionToken}`),csrfToken:credentials.csrfToken},input.command));
 }catch{return reply({code:'SSO_EMERGENCY_REFUSED'},403);}
}
