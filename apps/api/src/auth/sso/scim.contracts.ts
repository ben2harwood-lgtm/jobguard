import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const scimDeactivationV1=z.object({version:z.literal("scim-deactivation.v1"),eventId:z.string().uuid(),subject:z.string().min(1).max(200),active:z.literal(false)}).strict();
const outcomes=["deactivated","ignored","refused"] as const;
const causes=["SCIM_DEACTIVATED","SCIM_SUBJECT_NOT_LINKED","SCIM_ALREADY_INACTIVE","SCIM_OWNER_PROTECTED"] as const;
export const scimDeactivationResultV1=z.object({version:z.literal("scim-deactivation-result.v1"),environment:z.literal("synthetic_demo"),eventId:z.string().uuid(),outcome:z.enum(outcomes),cause:z.enum(causes)}).strict().refine(r=>r.outcome===(r.cause==="SCIM_DEACTIVATED"?"deactivated":r.cause==="SCIM_OWNER_PROTECTED"?"refused":"ignored"));
export function scimSeed(raw:unknown):string|"unset" {return typeof raw==="string"&&/^[A-Za-z0-9_-]{43,200}$(?![\s\S])/u.test(raw)?raw:"unset";}
export function scimBearerFor(seed:string,connectionId:string):string {
 return createHmac("sha256",seed).update("scim-bearer.v1:"+connectionId.toLowerCase()).digest("base64url");
}
export function scimBearerProved(seed:string,connectionId:string,header:string|undefined):boolean {
 const expected=scimBearerFor(seed,connectionId);
 const matched=typeof header==="string"?/^Bearer ([A-Za-z0-9_-]{43})$(?![\s\S])/u.exec(header):null;
 const presented=matched?.[1]??"";
 const equal=timingSafeEqual(createHash("sha256").update(presented).digest(),createHash("sha256").update(expected).digest());
 return matched!==null && equal;
}
export const scimUnparsedBody=Symbol("scim-unparsed-body");
export const scimCodes=["SCIM_REFUSED","INVALID_SCIM_INPUT","SCIM_EVENT_CONFLICT","SCIM_UNAVAILABLE"] as const;
export class ScimError extends Error {
 constructor(readonly code:typeof scimCodes[number],options?:ErrorOptions) {super(code,options);this.name="ScimError";}
}
const statuses:Record<typeof scimCodes[number],number>={SCIM_REFUSED:403,INVALID_SCIM_INPUT:400,SCIM_EVENT_CONFLICT:409,SCIM_UNAVAILABLE:503};
export function scimStatus(error:unknown):{code:typeof scimCodes[number];status:number} {
 const code=error instanceof ScimError?error.code:"SCIM_REFUSED";
 return {code,status:statuses[code]};
}
