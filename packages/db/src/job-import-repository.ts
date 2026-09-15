import { randomUUID } from "node:crypto";
import { adoptJobV1, assertAdoptJob, IMPORT_LINEAGE_LABEL, PRODUCTION_IMPORT_ENABLED } from "@jobguard/core";
import type { AuditEventInput } from "./audit.js";
import type { CommandMutation, ConsequentialCommand } from "./commands.js";
import type { TenantTransaction } from "./tenant-context.js";

export class AdoptInFlightJobMutation implements CommandMutation<Record<string,unknown>> {
  constructor(private readonly tenantId:string, private readonly deploymentMode:"synthetic_candidate"|"production", private readonly raw:unknown) {}
  async mutate(db:TenantTransaction,command:ConsequentialCommand){
    if(this.deploymentMode==="production" || PRODUCTION_IMPORT_ENABLED) throw new Error("PRODUCTION_IMPORT_DECISION_APPROVAL_REQUIRED");
    const input=adoptJobV1.parse(this.raw);assertAdoptJob(input);
    if(command.actorMembershipId!==input.attestedByMembershipId||command.commandType!=="job.adopt_in_flight"||command.action.actionType!=="job.adopt_in_flight"||command.subjectType!=="job"||command.subjectRef!==input.jobId||command.action.contentHash!==input.baselineHash||command.action.aggregateRevision!==0||command.action.amountPence!==input.acceptedNetValuePence||command.action.currency!=="GBP"||command.action.policyVersion!==input.importTermsVersion)throw new Error("EXACT_IMPORT_AUTHORIZATION_MISMATCH");
    await db.$client.query(`SELECT app.adopt_in_flight_job($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[this.tenantId,input.jobId,input.baselineId,input.title,input.lifecyclePoint,input.baselineHash,input.baselineDescription,input.acceptedNetValuePence,input.recoveryCapPence,input.feePolicyVersion,input.importTermsVersion,input.attestedByMembershipId,input.attestedAt]);
    return {jobId:input.jobId,baselineId:input.baselineId,provenance:"imported",lifecyclePoint:input.lifecyclePoint,acceptedNetValuePence:input.acceptedNetValuePence,recoveryCapPence:input.recoveryCapPence,lineageStrength:"builder_attested_weaker",lineageLabel:IMPORT_LINEAGE_LABEL,billing:"none",historicFeesCreated:0};
  }
  auditEvents(_result:Record<string,unknown>,command:ConsequentialCommand):readonly AuditEventInput[]{const input=adoptJobV1.parse(this.raw);return[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType:"job.imported_baseline_attested",subjectType:"job",subjectRef:input.jobId,payload:{references:{baselineId:input.baselineId,attestedByMembershipId:input.attestedByMembershipId,attestedAt:input.attestedAt.toISOString(),provenance:"imported",lineageStrength:"builder_attested_weaker"},hashes:{baselineHash:input.baselineHash},classifications:{action:"commercial"}}}];}
}
