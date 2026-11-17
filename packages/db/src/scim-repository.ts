import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { EnterpriseIdentityRepository } from "./enterprise-identity-repository.js";
const codes=["SCIM_EVENT_CONFLICT","INVALID_SCIM_INPUT","SCIM_ROUTE_BLOCKED","SSO_ROUTE_BLOCKED","SSO_NOT_FOUND","SCIM_UNAVAILABLE"] as const;
export class ScimRepositoryError extends Error {
 constructor(readonly code:typeof codes[number],options?:ErrorOptions) {super(code,options);this.name="ScimRepositoryError";}
}
const resultSchema=z.object({outcome:z.enum(["deactivated","ignored","refused"]),cause:z.enum(["SCIM_DEACTIVATED","SCIM_SUBJECT_NOT_LINKED","SCIM_ALREADY_INACTIVE","SCIM_OWNER_PROTECTED"]),recordId:z.string().uuid(),replayed:z.boolean()}).strict().refine(r=>r.outcome===(r.cause==="SCIM_DEACTIVATED"?"deactivated":r.cause==="SCIM_OWNER_PROTECTED"?"refused":"ignored"));
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
/** Restricted identity pool; the governed transaction owns revocation, immutable receipt and final audit. */
export class ScimRepository {
 readonly enterprise:EnterpriseIdentityRepository;
 constructor(readonly pool:Pool) {this.enterprise=new EnterpriseIdentityRepository(pool);}
 refusal(target:string,code:string):Promise<void> {return this.enterprise.refusal(target,code);}
 async deactivate(connectionId:string,input:{eventId:string;subject:string}) {
  const c=connectionId.toLowerCase(),eventId=input.eventId.toLowerCase(),subjectHash=hash(input.subject),version="scim-deactivation.v1";
  const eventHash=hash(JSON.stringify({active:false,connectionId:c,eventId,subjectHash,version}));
  try {
   return await this.enterprise.transaction(async client=>{
    const result=resultSchema.parse((await client.query<{result:unknown}>("SELECT identity.scim_deactivate($1,$2::jsonb) result",[c,JSON.stringify({version,eventId,subjectHash,eventHash})])).rows[0]?.result);
    if(!result.replayed)await this.enterprise.audit(client,c,`sso.scim.${result.outcome}`,"identity:scim",result.cause,eventHash);
    return result;
   });
  }catch(error) {
   const message=error instanceof Error?error.message:undefined;
   const code=codes.find(cause=>cause!=="SCIM_UNAVAILABLE"&&cause===message);
   throw new ScimRepositoryError(code??"SCIM_UNAVAILABLE",code?undefined:{cause:error});
  }
 }
}
