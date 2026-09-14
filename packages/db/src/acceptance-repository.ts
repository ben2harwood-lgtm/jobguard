import { randomUUID } from "node:crypto";
import { builderAttestedAcceptanceV1, quoteDispositionV1 } from "@jobguard/core";
import type { AuditEventInput } from "./audit.js";
import type { CommandMutation, ConsequentialCommand } from "./commands.js";
import type { TenantTransaction } from "./tenant-context.js";

const domainAudit=(command:ConsequentialCommand,eventType:string,eventId:string,documentId:string,hash:string):AuditEventInput=>({id:randomUUID(),version:"audit.v1",actorRef:`membership:${command.actorMembershipId}`,eventType,subjectType:"quote_document",subjectRef:documentId,payload:{references:{acceptanceEventId:eventId},hashes:{documentHash:hash},classifications:{action:"commercial"}}});

export class RecordBuilderAcceptanceMutation implements CommandMutation<Record<string,unknown>> {
  private eventId="";
  constructor(private readonly tenantId:string,private readonly raw:unknown){}
  async mutate(db:TenantTransaction,command:ConsequentialCommand){const input=builderAttestedAcceptanceV1.parse(this.raw);this.eventId=randomUUID();if(command.action.actionType!=="quote.acceptance.attest"||command.action.contentHash!==input.documentHash||command.action.aggregateRevision!==input.documentVersion||command.action.amountPence!==input.acceptedTotalPence||command.action.currency!=="GBP"||command.action.policyVersion!=="builder-attestation.v1")throw new Error("EXACT_ACCEPTANCE_AUTHORIZATION_MISMATCH");const result=(await db.$client.query(`SELECT * FROM app.record_builder_attested_acceptance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[this.tenantId,input.acceptanceId,this.eventId,input.jobId,input.documentId,input.documentVersion,input.documentHash,input.acceptedTotalPence,input.expectedJobRevision,command.actorMembershipId,input.statedCustomerName,input.statedMethod,input.acceptedAt,input.evidenceId])).rows[0] as Record<string,unknown>;return{acceptanceId:input.acceptanceId,eventId:this.eventId,jobId:input.jobId,documentId:input.documentId,documentVersion:input.documentVersion,documentHash:input.documentHash,acceptedTotalPence:input.acceptedTotalPence,acceptanceKind:result.acceptance_kind,state:"accepted"};}
  auditEvents(_result:Record<string,unknown>,command:ConsequentialCommand){const input=builderAttestedAcceptanceV1.parse(this.raw);return[domainAudit(command,"quote.acceptance.attested",this.eventId,input.documentId,input.documentHash)];}
}

export class RecordQuoteDispositionMutation implements CommandMutation<Record<string,unknown>> {
  constructor(private readonly tenantId:string,private readonly raw:unknown){}
  async mutate(db:TenantTransaction,command:ConsequentialCommand){const input=quoteDispositionV1.parse(this.raw);if(command.action.actionType!==`quote.${input.kind}`||command.action.contentHash!==input.documentHash||command.action.aggregateRevision!==input.documentVersion||command.action.amountPence!==null||command.action.currency!==null)throw new Error("EXACT_DISPOSITION_AUTHORIZATION_MISMATCH");await db.$client.query(`SELECT * FROM app.record_quote_disposition($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[this.tenantId,input.eventId,input.jobId,input.documentId,input.documentVersion,input.documentHash,input.expectedJobRevision,command.actorMembershipId,input.kind,input.occurredAt]);return{eventId:input.eventId,jobId:input.jobId,documentId:input.documentId,kind:input.kind,state:input.kind==="declined"?"lost":"quoting"};}
  auditEvents(_result:Record<string,unknown>,command:ConsequentialCommand){const input=quoteDispositionV1.parse(this.raw);return[domainAudit(command,`quote.${input.kind}`,input.eventId,input.documentId,input.documentHash)];}
}
