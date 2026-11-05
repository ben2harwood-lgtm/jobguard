import { z } from 'zod';
const uuid=z.guid(), hash=z.string().regex(/^[a-f0-9]{64}$/u);
const base={version:z.literal('emergency.v1'),requestId:uuid};
export const emergencyCommandV1=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('request'),reasonHash:hash}).strict(),
 z.object({...base,operation:z.literal('approve')}).strict(),
 z.object({...base,operation:z.literal('open'),tokenHash:hash}).strict(),
 z.object({...base,operation:z.literal('inspect'),tokenHash:hash}).strict(),
 z.object({...base,operation:z.literal('revoke_member'),tokenHash:hash,targetMembershipId:uuid}).strict(),
 z.object({version:z.literal('emergency.v1'),operation:z.literal('notices')}).strict(),
]);
export const scim2User=z.object({schemas:z.tuple([z.literal('urn:ietf:params:scim:schemas:core:2.0:User')]),
 externalId:z.string().min(1).max(200),userName:z.email().max(320).refine(v=>v===v.toLowerCase()&&v.endsWith('.invalid')),
 active:z.boolean(),displayName:z.string().max(200).optional()}).strict();
export const scim2Group=z.object({schemas:z.tuple([z.literal('urn:ietf:params:scim:schemas:core:2.0:Group')]),
 displayName:z.string().min(1).max(200),externalId:z.string().min(1).max(200).optional(),
 members:z.array(z.object({value:uuid}).strict()).max(200).refine(v=>new Set(v.map(m=>m.value)).size===v.length)}).strict();
export const scim2Request=z.object({version:z.literal('scim2-request.v1'),bindingId:uuid,
 method:z.enum(['GET','POST','PUT','PATCH','DELETE']),kind:z.enum(['Users','Groups']),id:uuid.optional(),
 eventId:uuid.optional(),expectedRevision:z.number().int().positive().optional(),body:z.unknown().optional()}).strict()
 .refine(v=>v.method==='GET'||v.eventId!==undefined)
 .refine(v=>!['PUT','PATCH','DELETE'].includes(v.method)||v.id!==undefined)
 .refine(v=>!['PUT','PATCH','DELETE'].includes(v.method)||v.expectedRevision!==undefined);
export const scim2Configuration=z.object({version:z.literal('scim2-config.v1'),bindingId:uuid,connectionId:uuid,
 enabled:z.boolean(),tokenHash:hash}).strict();
export const scim2Patch=z.object({schemas:z.tuple([z.literal('urn:ietf:params:scim:api:messages:2.0:PatchOp')]),
 Operations:z.array(z.object({op:z.string().transform(v=>v.toLowerCase()).pipe(z.enum(['add','replace','remove'])),path:z.enum(['active','displayName','members']),value:z.unknown().optional()}).strict()).min(1).max(20)}).strict();
export class EnterpriseAccessError extends Error {
 constructor(readonly code:'ACCESS_REFUSED'|'INVALID_ACCESS_INPUT'|'SCIM_CONFLICT'|'SCIM_STALE'|'SCIM_NOT_FOUND'|'ACCESS_UNAVAILABLE') {super(code);}
}
