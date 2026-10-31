// Historical-schema tests deliberately use owner connections and the retained old
// routines until LP-3 exists. Application code has no old-signature fallback.
import { randomUUID } from "node:crypto";
import { RecordBuilderAcceptanceMutation as Acceptance, RecordQuoteDispositionMutation as Disposition } from "../src/acceptance-repository.js";
import type { ConsequentialCommand } from "../src/commands.js";
import type { TenantTransaction } from "../src/tenant-context.js";

async function legacyOwner(db: TenantTransaction) {
  const row=(await db.$client.query(`SELECT r.rolsuper,
    to_regclass('app.activation_acceptance_operation_use') IS NOT NULL AS cutover
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  if(row.cutover)return false;
  if(!row.rolsuper)throw new Error("Historical fixture requires owner connection");
  return true;
}
export class RecordBuilderAcceptanceMutation extends Acceptance {
  constructor(private readonly tenant:string,private readonly input:any){super(tenant,input);}
  override auditEvents(result:Record<string,unknown>,command:ConsequentialCommand){return [{id:randomUUID(),version:"audit.v1" as const,actorRef:`membership:${command.actorMembershipId}`,eventType:"quote.acceptance.attested",subjectType:"quote_document",subjectRef:String(result.documentId),payload:{references:{acceptanceEventId:String(result.eventId)},hashes:{documentHash:String(result.documentHash)},classifications:{action:"commercial" as const}}}];}
  override async mutate(db:TenantTransaction,command:ConsequentialCommand){
    if(!await legacyOwner(db))return super.mutate(db,command);
    const i=this.input,eventId=randomUUID();
    const row=(await db.$client.query(`SELECT * FROM app.record_builder_attested_acceptance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [this.tenant,i.acceptanceId,eventId,i.jobId,i.documentId,i.documentVersion,i.documentHash,i.acceptedTotalPence,i.expectedJobRevision,command.actorMembershipId,i.statedCustomerName,i.statedMethod,i.acceptedAt,i.evidenceId])).rows[0];
    return {acceptanceId:i.acceptanceId,eventId,jobId:i.jobId,documentId:i.documentId,documentVersion:i.documentVersion,documentHash:i.documentHash,acceptedTotalPence:i.acceptedTotalPence,acceptanceKind:row.acceptance_kind,state:"accepted"};
  }
}
export class RecordQuoteDispositionMutation extends Disposition {
  constructor(private readonly tenant:string,private readonly input:any){super(tenant,input);}
  override async mutate(db:TenantTransaction,command:ConsequentialCommand){
    if(!await legacyOwner(db))return super.mutate(db,command);
    const i=this.input;
    await db.$client.query(`SELECT * FROM app.record_quote_disposition($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [this.tenant,i.eventId,i.jobId,i.documentId,i.documentVersion,i.documentHash,i.expectedJobRevision,command.actorMembershipId,i.kind,i.occurredAt]);
    return {eventId:i.eventId,jobId:i.jobId,documentId:i.documentId,kind:i.kind,state:i.kind==="declined"?"lost":"quoting"};
  }
}
