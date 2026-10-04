import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_IDENTITY_USER_ID, JobPartiesRepository, JobPartiesError, UserCommandDispatcher, AdoptInFlightJobMutation, CommandError, withTenant, verifiedTenantContextFromMembership } from "@jobguard/db";
import { jobPartiesCommandV1, jobPartiesImportV1, jobPartiesImportResultV1 } from "@jobguard/core";
import { SYNTHETIC_SESSION } from "./workspace/workspace-session.js";
export { JobPartiesError } from "@jobguard/db";
export type PartiesPrincipal = { sessionId: string; requestedTenantId?: string } | null;
export class JobPartiesApplication {
  private readonly repository: JobPartiesRepository;
  constructor(private readonly pool: Pool) { this.repository = new JobPartiesRepository(pool); }
  private context(principal: PartiesPrincipal, jobId: string) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo" || principal?.sessionId !== SYNTHETIC_SESSION) throw new JobPartiesError("FORBIDDEN");
    if (principal.requestedTenantId && principal.requestedTenantId !== DEMO_TENANT_ID) throw new JobPartiesError("FORBIDDEN");
    if (!z.string().uuid().safeParse(jobId).success) throw new JobPartiesError("NOT_FOUND");
    return verifiedTenantContextFromMembership({ identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
  }
  list(principal: PartiesPrincipal) {return this.repository.list(this.context(principal,DEMO_TENANT_ID),DEMO_MEMBERSHIP_ID);}
  view(principal: PartiesPrincipal, jobId: string) { return this.repository.view(this.context(principal, jobId), DEMO_MEMBERSHIP_ID, jobId); }
  command(principal: PartiesPrincipal, jobId: string, raw: unknown) { const context=this.context(principal,jobId);const input=jobPartiesCommandV1.safeParse(raw);if(!input.success||((input.data.action==="create_customer"||input.data.action==="revise_customer")&&input.data.customer.email&&!input.data.customer.email.endsWith(".invalid")))throw new JobPartiesError("INVALID_PARTIES");return this.repository.command(context, DEMO_MEMBERSHIP_ID, jobId, input.data); }
  async adopt(principal: PartiesPrincipal, sourceJobId: string, raw: unknown) {
    const context = this.context(principal, sourceJobId), parsed = jobPartiesImportV1.safeParse(raw);
    if (!parsed.success) throw new JobPartiesError("INVALID_PARTIES");
    const source = await this.repository.view(context, DEMO_MEMBERSHIP_ID, sourceJobId);
    const previous=await withTenant(this.pool,context,async db=>(await db.$client.query(`SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,parsed.data.commandId])).rows[0]);
    if(previous){if(previous.status!=="succeeded"||previous.result.sourceJobId!==sourceJobId||previous.result.sourceBindingId!==parsed.data.expectedBindingId)throw new JobPartiesError("COMMAND_CONFLICT");return jobPartiesImportResultV1.parse(previous.result);}
    if (!source.current) throw new JobPartiesError("JOB_PARTIES_REQUIRED");
    if (source.current.bindingId !== parsed.data.expectedBindingId) throw new JobPartiesError("REVISION_CONFLICT");
    const deterministicId = (kind: string) => { const h = createHash("sha256").update(`${DEMO_TENANT_ID}|${parsed.data.commandId}|${kind}`).digest("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
    const jobId = deterministicId("job"), baselineId = deterministicId("baseline");
    const baselineDescription = "Supplied fictional decorating job already under way — synthetic builder attestation only";
    const baselineHash = createHash("sha256").update(JSON.stringify({sourceJobId,bindingId:source.current.bindingId,baselineDescription,netPence:100000})).digest("hex");
    const mutation = new AdoptInFlightJobMutation(DEMO_TENANT_ID,"synthetic_candidate", {version:"adopt-job.v1",jobId,baselineId,title:"Fictional adopted job",lifecyclePoint:"live",provenance:"imported",lineageStrength:"builder_attested_weaker",baselineHash,baselineDescription,acceptedNetValuePence:100000,recoveryCapPence:1500,acceptedValueSource:"builder_attestation",attestedByMembershipId:DEMO_MEMBERSHIP_ID,attestedAt:new Date(0),importTermsVersion:"synthetic_import_terms_candidate.v1",feePolicyVersion:"reference_fee_policy_v1",mode:"synthetic_candidate",parties:{customerRevisionId:source.current.customerRevisionId,siteRevisionId:source.current.siteRevisionId,payingPartyRevisionId:source.current.payingPartyRevisionId}});
    return new UserCommandDispatcher(this.pool).dispatch(context, {version:"command.v1",commandId:parsed.data.commandId,commandType:"job.adopt_in_flight",semanticKey:`import:${jobId}`,actorMembershipId:DEMO_MEMBERSHIP_ID,subjectType:"job",subjectRef:jobId,action:{actionType:"job.adopt_in_flight",recipient:null,contentHash:baselineHash,aggregateRevision:0,amountPence:100000,currency:"GBP",policyVersion:"synthetic_import_terms_candidate.v1",expiresAt:new Date(Date.now()+300000)}},
      {mutate:async(db,command)=>{const locked=(await db.$client.query(`SELECT app.require_current_job_parties($1,$2) snapshot`,[context.tenantId,sourceJobId])).rows[0]?.snapshot;if(locked?.bindingId!==parsed.data.expectedBindingId)throw new JobPartiesError("REVISION_CONFLICT");return jobPartiesImportResultV1.parse({...await mutation.mutate(db,command),version:"job-parties-import-result.v1",sourceJobId,sourceBindingId:parsed.data.expectedBindingId,environment:"synthetic_demo",realExternalActions:0});},auditEvents:(result,command)=>mutation.auditEvents(result,command)}).catch(async error=>{
        // Concurrent identical web requests may construct different authorization
        // expiry timestamps. Reconcile their durable result by the exact public
        // command payload; never run a second import or approve another action.
        if(error instanceof CommandError && error.code==="COMMAND_CONFLICT"){
          const prior=await withTenant(this.pool,context,async db=>(await db.$client.query(`SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2`,[context.tenantId,parsed.data.commandId])).rows[0]);
          if(prior?.status==="succeeded"&&prior.result.sourceJobId===sourceJobId&&prior.result.sourceBindingId===parsed.data.expectedBindingId)return jobPartiesImportResultV1.parse(prior.result);
        }
        if(error instanceof CommandError)throw new JobPartiesError(error.code==="FORBIDDEN"?"FORBIDDEN":"COMMAND_CONFLICT");throw error;
      });
  }

}
