import type { Pool } from 'pg';
import { verifiedTenantContextForQueuedJob, withTenant, type VerifiedTenantContext } from './tenant-context.js';
/** DARK: identity and machine pools are separate credentials, never business-runtime pools. */
export class EnterpriseAccessRepository {
 constructor(private readonly identity: Pool, private readonly machine: Pick<Pool,'query'>) {}
 async emergency(context: VerifiedTenantContext, actor: {sessionDigest:string;csrfToken:string}, input: unknown): Promise<unknown> {
  return withTenant(this.identity,context,async db => (await db.$client.query<{result:unknown}>(
   'SELECT identity.dark_emergency($1,$2,$3,$4::jsonb) result',
   [actor.sessionDigest,actor.csrfToken,context.tenantId,JSON.stringify(input)])).rows[0]?.result);
 }
 async emergencyNotices(context: VerifiedTenantContext, actor: {sessionDigest:string;csrfToken:string}): Promise<unknown> {
  // Ben's 6 Nov 2026 router-chat "yes": this named sessionless port only.
  // Sessionless by design: this identity login cannot bind; dark_emergency verifies the session and CSRF.
  // Hold: the break-glass identity design goes to Ben before real data.
  const scoped = verifiedTenantContextForQueuedJob(context.tenantId);
  return withTenant(this.identity,scoped,async db => (await db.$client.query<{result:unknown}>(
   'SELECT identity.dark_emergency($1,$2,$3,$4::jsonb) result',
   [actor.sessionDigest,actor.csrfToken,context.tenantId,JSON.stringify({version:"emergency.v1",operation:"notices"})])).rows[0]?.result);
 }
 async configure(context: VerifiedTenantContext, actor: {sessionDigest:string;csrfToken:string}, input: {bindingId:string;connectionId:string;enabled:boolean;tokenHash:string}): Promise<void> {
  await withTenant(this.identity,context,async db => {await db.$client.query(
   'SELECT identity.scim2_configure($1,$2,$3,$4,$5,$6,$7)',
   [actor.sessionDigest,actor.csrfToken,context.tenantId,input.bindingId,input.connectionId,input.enabled,input.tokenHash]);});
 }
 async scim(bindingId:string,token:string,input:unknown): Promise<unknown> {
  return (await this.machine.query<{result:unknown}>('SELECT identity.scim2_machine($1,$2,$3::jsonb) result',
   [bindingId,token,JSON.stringify(input)])).rows[0]?.result;
 }
}
