import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/u),ref=z.string().min(1).max(200);
const base=z.object({journalId:uuid.optional(),bookId:uuid,amountPence:z.number().int().positive(),currency:z.literal("GBP"),sourceEventId:ref,provenanceRef:ref,artifactHash:hash,authorizationId:uuid,actorRef:ref});
export const planObligationV1=base.extend({schemaVersion:z.literal(1),receivableAccountId:uuid,deferredIncomeAccountId:uuid,provenanceKind:z.literal("synthetic_authorized_plan")}).strict();
export const planSettlementV1=base.extend({schemaVersion:z.literal(1),obligationJournalId:uuid,clearingAccountId:uuid,receivableAccountId:uuid}).strict();
export const journalReversalV1=z.object({schemaVersion:z.literal(1),journalId:uuid.optional(),bookId:uuid,originalJournalId:uuid,sourceEventId:ref,provenanceRef:ref,artifactHash:hash,authorizationId:uuid,actorRef:ref}).strict();

/** Proof is created by a command handler after current membership/permission checks. */
export interface FinancialAuthorizationProof {readonly authorizationId:string;readonly actorRef:string;readonly permission:"finance:approve";}
/* Provenance required by the future qualifying-landing service; it is not fee entitlement. */
export interface CandidateFeeDerivation {readonly schemaVersion:1;readonly tenantId:string;readonly jobId:string;readonly candidateId:string;readonly policyVersion:string;readonly sourceEventIds:readonly string[];}
export interface QualifyingLandingPostingPort {postQualifyingLanding(candidate:CandidateFeeDerivation,authorization:FinancialAuthorizationProof):Promise<never>;}
export class RecoveryFeePostingDisabledError extends Error{readonly code="RECOVERY_FEE_POSTING_DISABLED";constructor(){super("Recovery-fee posting is disabled until qualifying proof and approvals exist");}}
export class DisabledQualifyingLandingPostingPort implements QualifyingLandingPostingPort{async postQualifyingLanding():Promise<never>{throw new RecoveryFeePostingDisabledError();}}

export class LedgerRepository{
 constructor(private readonly pool:Pool){}
 private require(proof:FinancialAuthorizationProof,input:{authorizationId:string;actorRef:string}){if(proof.permission!=="finance:approve"||proof.authorizationId!==input.authorizationId||proof.actorRef!==input.actorRef)throw new Error("FORBIDDEN");}
 async postPlanObligation(context:VerifiedTenantContext,proof:FinancialAuthorizationProof,raw:unknown){const i=planObligationV1.parse(raw);this.require(proof,i);return withTenant(this.pool,context,async d=>{const journal=i.journalId??randomUUID(),audit=randomUUID();await d.$client.query("SELECT app.post_plan_obligation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[journal,i.bookId,i.receivableAccountId,i.deferredIncomeAccountId,i.amountPence,i.currency,i.sourceEventId,i.provenanceKind,i.provenanceRef,i.artifactHash,i.authorizationId,audit]);await appendAuditBatch(d,[{id:audit,version:"audit.v1",actorRef:i.actorRef,eventType:"financial.journal_posted",subjectType:"journal",subjectRef:journal,payload:{references:{sourceEventId:i.sourceEventId,provenanceRef:i.provenanceRef},hashes:{artifact:i.artifactHash},classifications:{record:"financial"}}}]);return journal;});}
 async postPlanSettlement(context:VerifiedTenantContext,proof:FinancialAuthorizationProof,raw:unknown){const i=planSettlementV1.parse(raw);this.require(proof,i);return withTenant(this.pool,context,async d=>{const journal=i.journalId??randomUUID(),audit=randomUUID();await d.$client.query("SELECT app.post_plan_settlement($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[journal,i.bookId,i.obligationJournalId,i.clearingAccountId,i.receivableAccountId,i.amountPence,i.currency,i.sourceEventId,i.provenanceRef,i.artifactHash,i.authorizationId,audit]);await appendAuditBatch(d,[{id:audit,version:"audit.v1",actorRef:i.actorRef,eventType:"financial.journal_posted",subjectType:"journal",subjectRef:journal,payload:{references:{sourceEventId:i.sourceEventId,provenanceRef:i.provenanceRef},hashes:{artifact:i.artifactHash},classifications:{record:"financial"}}}]);return journal;});}
 async reverse(context:VerifiedTenantContext,proof:FinancialAuthorizationProof,raw:unknown){const i=journalReversalV1.parse(raw);this.require(proof,i);return withTenant(this.pool,context,async d=>{const journal=i.journalId??randomUUID(),audit=randomUUID();await d.$client.query("SELECT app.reverse_journal($1,$2,$3,$4,$5,$6,$7,$8)",[journal,i.bookId,i.originalJournalId,i.sourceEventId,i.provenanceRef,i.artifactHash,i.authorizationId,audit]);await appendAuditBatch(d,[{id:audit,version:"audit.v1",actorRef:i.actorRef,eventType:"financial.journal_posted",subjectType:"journal",subjectRef:journal,payload:{references:{sourceEventId:i.sourceEventId,provenanceRef:i.provenanceRef},hashes:{artifact:i.artifactHash},classifications:{record:"financial"}}}]);return journal;});}
}
