import { randomUUID } from "node:crypto";
import { assertSwitchLiveTerms, simulatedSettlementV1, switchLiveV1 } from "@jobguard/core";
import type { AuditEventInput } from "./audit.js";
import type { CommandMutation, ConsequentialCommand } from "./commands.js";
import type { TenantTransaction } from "./tenant-context.js";

type DeploymentMode = "pilot_no_charge" | "synthetic_demo" | "production_billing";
const audit=(command:ConsequentialCommand,eventType:string,subjectRef:string,references:Record<string,string>,hash?:string):AuditEventInput=>({id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType,subjectType:"job",subjectRef,payload:{references,...(hash?{hashes:{acceptedDocumentHash:hash}}:{}),classifications:{action:"commercial"}}});

export class SwitchJobLiveMutation implements CommandMutation<Record<string,unknown>> {
  constructor(private readonly tenantId:string,private readonly deploymentMode:Exclude<DeploymentMode,"production_billing">,private readonly raw:unknown){}
  async mutate(db:TenantTransaction,command:ConsequentialCommand){const input=switchLiveV1.parse(this.raw);assertSwitchLiveTerms(input);
    if(input.mode!==this.deploymentMode)throw new Error("DEPLOYMENT_MODE_MISMATCH");
    const expectedAmount=input.mode==="synthetic_demo"?7900:null;
    if(command.action.actionType!=="job.switch_live"||command.subjectType!=="job"||command.subjectRef!==input.jobId||command.action.contentHash!==input.acceptedDocumentHash||command.action.aggregateRevision!==input.acceptedDocumentVersion||command.action.amountPence!==expectedAmount||command.action.currency!==(expectedAmount===null?null:"GBP")||command.action.policyVersion!==input.activationTermsVersion)throw new Error("EXACT_ACTIVATION_AUTHORIZATION_MISMATCH");
    await db.$client.query(`SELECT * FROM app.switch_job_live($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[this.tenantId,input.activationId,input.capSnapshotId,input.syntheticObligationId,input.jobId,input.acceptedDocumentId,input.acceptedDocumentVersion,input.acceptedDocumentHash,input.expectedJobRevision,input.acceptedNetValuePence,input.recoveryCapPence,input.mode,input.activationTermsVersion,input.feePolicyVersion,command.actorMembershipId,input.activatedAt]);
    return{activationId:input.activationId,capSnapshotId:input.capSnapshotId,syntheticObligationId:input.syntheticObligationId,jobId:input.jobId,state:"live",mode:input.mode,acceptedNetValuePence:input.acceptedNetValuePence,recoveryCapPence:input.recoveryCapPence,label:input.mode==="pilot_no_charge"?"no charge":"illustrative only"};}
  auditEvents(_result:Record<string,unknown>,command:ConsequentialCommand){const input=switchLiveV1.parse(this.raw);return[audit(command,"job.switched_live",input.jobId,{activationId:input.activationId,capSnapshotId:input.capSnapshotId,acceptedDocumentId:input.acceptedDocumentId},input.acceptedDocumentHash)];}
}

export class RecordSimulatedSettlementMutation implements CommandMutation<Record<string,unknown>> {
  constructor(private readonly tenantId:string,private readonly deploymentMode:DeploymentMode,private readonly raw:unknown){}
  async mutate(db:TenantTransaction,command:ConsequentialCommand){if(this.deploymentMode!=="synthetic_demo")throw new Error("SIMULATED_SETTLEMENT_ENVIRONMENT_FORBIDDEN");const input=simulatedSettlementV1.parse(this.raw);
    if(command.action.actionType!=="synthetic_obligation.simulate_settlement"||command.subjectRef!==input.obligationId||command.action.amountPence!==input.amountPence||command.action.currency!=="GBP"||command.action.policyVersion!=="synthetic_demo_illustrative.v1")throw new Error("EXACT_SIMULATION_AUTHORIZATION_MISMATCH");
    await db.$client.query(`SELECT * FROM app.record_simulated_settlement($1,$2,$3,$4,$5,$6)`,[this.tenantId,input.settlementId,input.obligationId,input.providerEventId,input.amountPence,input.simulatedAt]);return{settlementId:input.settlementId,obligationId:input.obligationId,label:"simulated — not collected"};}
  auditEvents(_result:Record<string,unknown>,command:ConsequentialCommand){const input=simulatedSettlementV1.parse(this.raw);return[audit(command,"synthetic_obligation.simulated_settlement",input.obligationId,{settlementId:input.settlementId,providerEventId:input.providerEventId})];}
}
