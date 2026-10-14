import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { EnterpriseIdentityRepository } from "./enterprise-identity-repository.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid=z.string().uuid();
export const ssoRequiredStateV1=z.object({version:z.literal("sso-required-state.v1"),environment:z.literal("synthetic_demo"),tenantId:uuid,required:z.boolean(),revision:z.number().int().nonnegative(),unlinkedMembers:z.number().int().nonnegative(),auditConnectionId:uuid.nullable()}).strict();
const commandResult=z.object({connectionId:uuid,actorMembershipId:uuid,eventId:uuid,revision:z.number().int().positive(),required:z.boolean()}).strict();
const timestamp=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u);
export const ssoRequiredDetailV1=z.object({
 version:z.literal("sso-required-detail.v1"),environment:z.literal("synthetic_demo"),tenantId:uuid,required:z.boolean(),revision:z.number().int().nonnegative(),
 emergencyWindow:z.object({openedAt:timestamp.nullable(),closesAt:timestamp.nullable(),windowMinutes:z.number().int().min(15).max(240).nullable(),open:z.boolean()}).strict().refine(w=>(w.openedAt===null&&w.closesAt===null&&w.windowMinutes===null&&!w.open)||(w.openedAt!==null&&w.closesAt!==null&&w.windowMinutes!==null)).nullable(),
 unlinked:z.object({total:z.number().int().nonnegative(),truncated:z.boolean(),members:z.array(z.object({membershipId:uuid,email:z.string().email().max(320),role:z.string().min(1).max(40),kind:z.enum(["never_linked","linked_to_earlier_membership"])}).strict()).max(200)}).strict(),
 pendingInvitations:z.array(z.object({invitationId:uuid,email:z.string().email().max(320),role:z.string().min(1).max(40),expiresAt:timestamp}).strict()).max(200)
}).strict();
export type SsoRequiredDetail=z.infer<typeof ssoRequiredDetailV1>;
const emergencyResult=z.object({used:z.boolean(),cause:z.string().regex(/^[A-Z_]{1,40}$/u),connectionId:uuid.optional(),actorMembershipId:uuid.optional(),eventId:uuid.optional(),windowMinutes:z.number().int().min(15).max(240).optional(),closesAt:timestamp.optional()}).strict().refine(r=>r.used
 ?r.connectionId!==undefined&&r.actorMembershipId!==undefined&&r.eventId!==undefined&&r.windowMinutes!==undefined&&r.closesAt!==undefined
 :r.eventId===undefined&&r.windowMinutes===undefined&&r.closesAt===undefined);
export type SsoRequiredState=z.infer<typeof ssoRequiredStateV1>;
export type SsoEmergencyOutcome=z.infer<typeof emergencyResult>;
const hash=(reason:unknown)=>createHash("sha256").update(String(reason)).digest("hex");
/** Restricted identity pool only. Never retains a tenant context; audit targets come from SQL or live bindings. */
export class SsoRequiredRepository {
  readonly enterprise:EnterpriseIdentityRepository;
  constructor(readonly pool:Pool) { this.enterprise=new EnterpriseIdentityRepository(pool); }
  refusal(serverTarget:string,code:string):Promise<void> { return this.enterprise.refusal(serverTarget,code); }
  async view(context:VerifiedTenantContext,sessionDigest:string):Promise<SsoRequiredState> {
    return withTenant(this.pool,context,async db=>{
      const raw=(await db.$client.query<{result:unknown}>("SELECT identity.sso_required_view($1,$2) result",[sessionDigest,context.tenantId])).rows[0]?.result;
      return ssoRequiredStateV1.parse(raw);
    });
  }
  async detail(context:VerifiedTenantContext,sessionDigest:string):Promise<SsoRequiredDetail> {
    return withTenant(this.pool,context,async db=>{
      const raw=(await db.$client.query<{result:unknown}>("SELECT identity.sso_required_detail($1,$2) result",[sessionDigest,context.tenantId])).rows[0]?.result;
      return ssoRequiredDetailV1.parse(raw);
    });
  }
  async refusalTarget(context:VerifiedTenantContext,sessionDigest:string):Promise<string|null> {
    return (await this.view(context,sessionDigest)).auditConnectionId;
  }
  async command(context:VerifiedTenantContext,sessionDigest:string,input:Record<string,unknown>):Promise<SsoRequiredState> {
    return withTenant(this.pool,context,async db=>{
      const result=commandResult.parse((await db.$client.query<{result:unknown}>("SELECT identity.sso_required_command($1,$2::jsonb) result",[sessionDigest,JSON.stringify(input)])).rows[0]?.result);
      // Read the projection before audit append: no further business lock after the audit head.
      const state=ssoRequiredStateV1.parse((await db.$client.query<{result:unknown}>("SELECT identity.sso_required_view($1,$2) result",[sessionDigest,context.tenantId])).rows[0]?.result);
      await this.enterprise.audit(db.$client,result.connectionId,result.required?"sso.required.enabled":"sso.required.disabled",`membership:${result.actorMembershipId}`,undefined,hash(input.reason));
      return state;
    });
  }
  async emergency(userId:string,input:Record<string,unknown>,windowMinutes?:number|"invalid"):Promise<SsoEmergencyOutcome> {
    return this.enterprise.transaction(async client=>{
      const payload={version:input.version,requested_tenant_id:input.requested_tenant_id,commandId:input.commandId,windowMinutes:typeof windowMinutes==="number"&&Number.isFinite(windowMinutes)?windowMinutes:null,reason:input.reason};
      const result=emergencyResult.parse((await client.query<{result:unknown}>("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[userId,JSON.stringify(payload)])).rows[0]?.result);
      if(result.connectionId && result.actorMembershipId) {
        await this.enterprise.audit(client,result.connectionId,result.used?"sso.emergency.used":"sso.emergency.refused",`membership:${result.actorMembershipId}`,result.cause,hash(input.reason));
      }
      return result;
    });
  }
}
