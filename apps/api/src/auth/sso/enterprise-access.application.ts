import { z } from 'zod';
import type { DeploymentMode } from '@jobguard/config';
import type { EnterpriseAccessRepository, VerifiedTenantContext } from '@jobguard/db';
import { requireSyntheticSso } from './sso.contracts.js';
import { emergencyCommandV1, EnterpriseAccessError, scim2Configuration, scim2Group, scim2Patch, scim2Request, scim2User } from './enterprise-access.contracts.js';
type Actor={sessionDigest:string;csrfToken:string};
/** DARK service. Caller provides verified context and the actual session proof; no context minting or HTTP registration. */
export class EnterpriseAccessApplication {
 constructor(private readonly repository: Pick<EnterpriseAccessRepository,'emergency'|'configure'|'scim'>, private readonly mode:DeploymentMode) {}
 private gate():void {requireSyntheticSso(this.mode,'in-process-test-idp');}
 private failure(error:unknown):never {
  if(error instanceof EnterpriseAccessError)throw error;
  if(error instanceof z.ZodError)throw new EnterpriseAccessError('INVALID_ACCESS_INPUT');
  const message=error instanceof Error?error.message:'';
  if(message==='SCIM_CONFLICT'||message==='SCIM_STALE')throw new EnterpriseAccessError(message);
  if(message==='SCIM_NOT_FOUND')throw new EnterpriseAccessError('SCIM_NOT_FOUND');
  if(/^(EMERGENCY_|SCIM_|SSO_)/u.test(message))throw new EnterpriseAccessError('ACCESS_REFUSED');
  throw new EnterpriseAccessError('ACCESS_UNAVAILABLE');
 }
 async emergency(context:VerifiedTenantContext,actor:Actor,raw:unknown):Promise<unknown> {
  try {this.gate();return await this.repository.emergency(context,actor,emergencyCommandV1.parse(raw));}
  catch(error){return this.failure(error);}
 }
 async configure(context:VerifiedTenantContext,actor:Actor,raw:unknown):Promise<void> {
  try {this.gate();await this.repository.configure(context,actor,scim2Configuration.parse(raw));}
  catch(error){this.failure(error);}
 }
 /** Transport seam for SCIM 2.0 Users/Groups. Bearer bound to one machine binding; no human actor or supplied tenant. */
 async scim(authorization:string|undefined,raw:unknown):Promise<unknown> {
  try {
   this.gate();const input=scim2Request.parse(raw);
   const token=/^Bearer ([A-Za-z0-9_-]{43,200})$/u.exec(authorization??'')?.[1];
   if(!token)throw new EnterpriseAccessError('ACCESS_REFUSED');
   const base={version:'scim2-machine.v1',method:input.method,kind:input.kind,
    ...(input.id?{id:input.id}:input.method==='POST'?{id:input.eventId}:{}),
    ...(input.eventId?{eventId:input.eventId}:{}),...(input.expectedRevision?{expectedRevision:input.expectedRevision}:{})};
   let document=input.body;
   if(input.method==='PATCH')document=scim2Patch.parse(input.body);
   if(['POST','PUT'].includes(input.method))document=(input.kind==='Users'?scim2User:scim2Group).parse(document);
   return await this.repository.scim(input.bindingId,token,{...base,...(document!==undefined?{document}:{})});
  }catch(error){return this.failure(error);}
 }
}
