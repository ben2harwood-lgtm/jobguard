import { z } from "zod";
import type { Pool } from "pg";
import { FreeFirstJobLifecycleRepository, FreeFirstJobEligibilityRepository, FreeFirstJobCardRepository, FreeFirstJobPersistenceError } from "@jobguard/db";
import type { IdentityApplication } from "./auth/identity.application.js";
import type { TenantRequestCredentials } from "./auth/principal-bridge.js";
export class FreeFirstJobLifecycleApplication {
 private readonly lifecycle:FreeFirstJobLifecycleRepository;
 private readonly eligibility:FreeFirstJobEligibilityRepository;
 private readonly card:FreeFirstJobCardRepository;
 constructor(pool:Pool,private readonly identity:IdentityApplication){
  this.lifecycle=new FreeFirstJobLifecycleRepository(pool);this.eligibility=new FreeFirstJobEligibilityRepository(pool);this.card=new FreeFirstJobCardRepository(pool);
 }
 private async authorize(credentials:TenantRequestCredentials,jobId:string){
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_SYNTHETIC_ONLY");
  const context=await this.identity.context(credentials),principal=await this.identity.principal(credentials.sessionToken);
  const member=await this.identity.provider.findMembership(principal,context.tenantId);
  if(!member||member.role!=="owner")throw new FreeFirstJobPersistenceError("FREE_FIRST_JOB_ACCESS_DENIED");
  const digest=this.identity.provider.digest(`session:${credentials.sessionToken}`);
  // SQL rechecks current persisted company/session authority and target before disclosure.
  const source=await this.lifecycle.read(context,digest,jobId);
  return {context,digest,actor:member.id,source};
 }
 async read(credentials:TenantRequestCredentials,jobId:string,query:unknown={}){
  const auth=await this.authorize(credentials,jobId);z.object({}).strict().parse(query);
  return {...auth.source,version:"trial-screen.v1" as const,eligibility:await this.eligibility.read(auth.context,auth.digest,jobId)};
 }
 async command(credentials:TenantRequestCredentials,jobId:string,raw:unknown){
  const auth=await this.authorize(credentials,jobId);
  const input=z.discriminatedUnion("kind",[
   z.object({version:z.literal("trial-screen-command.v1"),kind:z.literal("request_card"),commandId:z.uuid()}).strict(),
   z.object({version:z.literal("trial-screen-command.v1"),kind:z.literal("simulate_card"),commandId:z.uuid()}).strict(),
  ]).parse(raw);
  if(input.kind==="request_card")return this.card.request(auth.context,auth.digest,input.commandId,{version:"trial-card-request.v1"});
  return this.lifecycle.simulateCard(auth.context,auth.digest,input.commandId,{version:"trial-card-simulate.v1"});
 }
 async activate(credentials:TenantRequestCredentials,jobId:string,raw:unknown){
  const auth=await this.authorize(credentials,jobId);
  const input=z.object({version:z.literal("trial-switch-live.v1"),commandId:z.uuid(),acceptedDocumentId:z.uuid(),acceptedDocumentVersion:z.number().int().positive().max(2147483647),acceptedDocumentHash:z.string().regex(/^[a-f0-9]{64}$/u),expectedJobRevision:z.number().int().nonnegative().max(2147483647)}).strict().parse(raw);
  return this.lifecycle.activate(auth.context,auth.digest,auth.actor,{...input,jobId});
 }
}
export function trialHttpFailure(error:unknown){
 if(!(error instanceof FreeFirstJobPersistenceError))return null;
 const status=error.code==="FREE_FIRST_JOB_ACCESS_DENIED"?404:error.code==="INVALID_FREE_FIRST_JOB_INPUT"?400:409;
 return {status,body:{version:"trial-error.v1",code:error.code,...(error.code==="TRIAL_COMPLETED_CARD_REQUIRED"?{action:"Add a card"}:{}),environment:"synthetic_demo",realExternalActions:0}};
}
