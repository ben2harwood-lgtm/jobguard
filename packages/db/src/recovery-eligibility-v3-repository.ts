import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { evaluateRecoveryEligibilityV3, moneyFromBigInt, recoveryEligibilityCommandV3, recoveryEligibilityViewV3, recoveryFixtureDefinitionV3, RecoveryEligibilityV3Error, type RecoveryEligibilityViewV3 } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { reviewPracticeSupplierCredit } from "./practice-supplier-credit-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
export type RecoveryEligibilityV3Review = Readonly<{id:string;revision:number;caseRevision:number;sourceEventId:string|null;result:RecoveryEligibilityViewV3}>;
export async function readRecoveryEligibilityV3(db:TenantTransaction,tenantId:string,caseId:string):Promise<RecoveryEligibilityV3Review|null> {
 const r=(await db.$client.query<{id:string;revision:number;case_revision:number;source_event_id:string|null;result:unknown}>("SELECT id,revision,case_revision,source_event_id,result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision DESC LIMIT 1",[tenantId,caseId])).rows[0];
 return r?{id:r.id,revision:r.revision,caseRevision:r.case_revision,sourceEventId:r.source_event_id,result:recoveryEligibilityViewV3.parse(r.result)}:null;
}
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class RecoveryEligibilityV3Repository {
 constructor(private readonly pool:Pool,private readonly environment=process.env.JOBGUARD_ENV??"unconfigured"){}
 async review(context:VerifiedTenantContext,jobId:string,raw:unknown,actor:Readonly<{membershipId:string;identityUserId:string}>,sessionDigest:string):Promise<RecoveryEligibilityV3Review> {
  if(this.environment!=="synthetic_demo")throw new Error("ELIGIBILITY_REVIEWER_FORBIDDEN");
  const parsed=recoveryEligibilityCommandV3.safeParse(raw);if(!parsed.success)throw new RecoveryEligibilityV3Error("INVALID_COMMAND");
  const input={...parsed.data,commandId:parsed.data.commandId.toLowerCase(),caseId:parsed.data.caseId.toLowerCase()},job=jobId.toLowerCase();
  if(input.fixture==="F14"||input.fixture==="F16-partial"||input.fixture==="F16-full")return reviewPracticeSupplierCredit(this.pool,context,job,input,sessionDigest);
  const payloadHash=hash({jobId:job,...input});
  return withTenant(this.pool,context,async db=>{
   await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
   const member=await db.$client.query(`SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session($4) p
    ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
    WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`,[context.tenantId,actor.membershipId,actor.identityUserId,sessionDigest]);
   if(member.rowCount!==1)throw new Error("ELIGIBILITY_REVIEWER_FORBIDDEN");
   if(!(await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 AND practice_session_digest=$3",[context.tenantId,job,sessionDigest])).rowCount)throw new Error("RECOVERY_JOB_NOT_FOUND");
   // Command identity then the shared case advisory key; every business lock precedes audit.
   await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.tenantId,`eligibility-v3:${input.commandId}`]);
   await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.tenantId,input.caseId]);
   const replay=(await db.$client.query<{id:string;payload_hash:string;revision:number;case_revision:number;source_event_id:string|null;result:unknown;job_id:string}>("SELECT * FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND command_id=$2",[context.tenantId,input.commandId])).rows[0];
   if(replay){if(replay.payload_hash.trim()!==payloadHash||replay.job_id!==job)throw new Error("IDEMPOTENCY_PAYLOAD_CONFLICT");return {id:replay.id,revision:replay.revision,caseRevision:replay.case_revision,sourceEventId:replay.source_event_id,result:recoveryEligibilityViewV3.parse(replay.result)};}
   const c=(await db.$client.query<{case_type:string;revision:number;claim_pence:string}>("SELECT case_type,revision,claim_pence FROM app.recovery_case_current WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND claim_revision IS NOT NULL",[context.tenantId,job,input.caseId])).rows[0];
   if(!c)throw new Error("RECOVERY_CASE_NOT_FOUND");
   const latest=await readRecoveryEligibilityV3(db,context.tenantId,input.caseId);
   if(c.revision!==input.expectedCaseRevision||(latest?.revision??0)!==input.expectedReviewRevision)throw new Error("ELIGIBILITY_STALE_REVISION");
   const definition=recoveryFixtureDefinitionV3(input.fixture);
   if(definition.category!==c.case_type||latest&&latest.result.fixture!==input.fixture)throw new RecoveryEligibilityV3Error("ELIGIBILITY_FIXTURE_MISMATCH");
   if(definition.credit&&input.fixture!=="F15")throw new RecoveryEligibilityV3Error("ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE");
   // Fixed M4-7-S facts only; prefer the ORIGINAL settled event, never a statement replay.
   const event= ["F15","F21","F22"].includes(input.fixture)?undefined:(await db.$client.query<{id:string;state:string;settled_before_opening:boolean;duplicate_held:boolean}>(`SELECT e.id,e.state,
    -- Decided once, here, on the original timestamptz values (microseconds); the 0119 guard restated in 0130 shares this decision for customer payments and F17 refunds.
    (e.state='settled' AND e.created_at<=(SELECT k.created_at FROM app.recovery_case_current k WHERE k.tenant_id=e.tenant_id AND k.job_id=e.job_id AND k.id=$4)) settled_before_opening,
    EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
      AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.movement_key=u.movement_key AND k.action='reconcile_duplicate')) duplicate_held
    FROM app.practice_feed_event e WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.movement_key=$3 AND e.identity='identified' AND e.event_kind IN('settled','pending')
    ORDER BY (e.event_kind='settled') DESC,e.created_at,e.id LIMIT 1`,[context.tenantId,job,definition.movement,input.caseId])).rows[0];
   if(!event&&!["F15","F21","F22"].includes(input.fixture))throw new RecoveryEligibilityV3Error("ELIGIBILITY_SOURCE_REQUIRED");
   const before=event?.settled_before_opening===true;
   if(input.fixture==="F20"&&!before)throw new RecoveryEligibilityV3Error("ELIGIBILITY_FIXTURE_MISMATCH");
   // Lock before deriving the fact, not only later in the INSERT trigger: a concurrent
   // mark or payer correction must commit wholly before or after this snapshot.
   let payer:{payer:"not_insurer"|"insurer_unmarked"|"insurer_customer_own";paying_party_binding_id:string|null;payer_mark_id:string|null}={payer:"not_insurer",paying_party_binding_id:null,payer_mark_id:null};
   if(definition.category==="withheld_customer_payment"&&event){
    // Earlier upgrade proofs execute this repository before atomic migration 0142.
    // Its table is the schema boundary; once present, missing helpers must fail.
    const payerSchema=(await db.$client.query<{installed:boolean}>("SELECT to_regclass('app.recovery_payment_payer_mark') IS NOT NULL installed")).rows[0]!;
    if(payerSchema.installed){
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[context.tenantId,`payer-mark:${event.id}`]);
    await db.$client.query("SELECT app.lock_recovery_payer_job($1::uuid,$2::uuid,$3::uuid)",[context.tenantId,job,actor.membershipId]);
    // One SQL decision uses the shared payer function, never the customer's type.
    payer=(await db.$client.query<typeof payer>(`WITH payer AS (SELECT app.recovery_job_payer_type($1,$2) payer_type)
     SELECT CASE WHEN payer_type IS DISTINCT FROM 'insurer' THEN 'not_insurer'
      WHEN m.state='customer_own' THEN 'insurer_customer_own' ELSE 'insurer_unmarked' END payer,
      CASE WHEN payer_type='insurer' THEN b.binding_id END paying_party_binding_id,
      CASE WHEN payer_type='insurer' AND m.state='customer_own' THEN m.id END payer_mark_id
     FROM payer LEFT JOIN app.job_party_current b ON b.tenant_id=$1 AND b.job_id=$2
     LEFT JOIN LATERAL(SELECT id,state FROM app.recovery_payment_payer_mark
      WHERE tenant_id=$1 AND job_id=$2 AND source_event_id=$3 ORDER BY revision DESC LIMIT 1) m ON true`,[context.tenantId,job,event.id])).rows[0]!;
    }
   }
   // Ruling 130 option B: fee terms never gate a review and a review never throws for their absence (the terms requirement lives at pursuit, CH-7-REST-A).
   // Read only a persisted, applicable approval under the shared case lock; never the pursuit helper, whose non-v3 exemption is not an approval.
   // No approval (or a schema that predates the terms table, as in the earlier upgrade proofs) means termsTiming stays undefined and the review evaluates as before DW3.
   const termsSchema=definition.category==="withheld_customer_payment"&&(await db.$client.query<{installed:boolean}>("SELECT to_regclass('app.recovery_case_terms_approval') IS NOT NULL installed")).rows[0]!.installed;
   const terms=!termsSchema?undefined:(await db.$client.query<{id:string}>(`SELECT a.id
    FROM app.recovery_case_terms_approval a JOIN app.job j ON j.tenant_id=a.tenant_id AND j.id=a.job_id AND j.fee_policy_version=a.fee_policy_version
    WHERE a.tenant_id=$1 AND a.job_id=$2 AND a.case_id=$3 AND a.terms_version='synthetic_recovery_fee_terms.v1'
     AND a.fee_policy_version='reference_fee_policy_v3' AND a.eligibility_policy_version='reference_recovery_eligibility_policy_v3'
     AND a.environment='synthetic_demo' AND a.policy_status='proposed'`,[context.tenantId,job,input.caseId])).rows[0];
   const termsTiming=async(sourceId:string|undefined):Promise<"before_settlement"|"after_settlement"|undefined>=>{
    if(!terms)return undefined;
    // Decision 123 excludes only money settled strictly BEFORE the approval (approved_at strictly after the settled source's created_at, full timestamptz precision).
    // Terms approved earlier, at the same instant, or with no settled source evaluate normally.
    const late=(await db.$client.query<{late:boolean}>(`SELECT (e.state='settled' AND a.approved_at>e.created_at) late
     FROM app.recovery_case_terms_approval a JOIN app.practice_feed_event e ON e.tenant_id=a.tenant_id AND e.job_id=a.job_id AND e.id=$3
     WHERE a.tenant_id=$1 AND a.id=$2`,[context.tenantId,terms.id,sourceId??null])).rows[0]?.late;
    return late===true?"after_settlement":"before_settlement";
   };
   let result=evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:context.tenantId,jobId:job,caseId:input.caseId,fixture:input.fixture,
    termsTiming:await termsTiming(event?.id),payer:payer.payer,settlement:event?.state==="settled"&&!event.duplicate_held?"settled":"pending",paymentTiming:before?"before_opening":"after_opening",sourceRef:event?.id??input.caseId});
   // Principal settlement cannot prove the separate, outside-VAT interest receipt.
   // Keep the existing whole-case exclusions; qualify F18's interest independently.
   let interestSourceEventId:string|undefined;
   if(input.fixture==="F18"&&result.qualifyingPrincipal.pence>0){
    const interest=(await db.$client.query<{id:string;state:string;settled_before_opening:boolean;duplicate_held:boolean}>(`SELECT e.id,e.state,
     (e.state='settled' AND e.created_at<=c.created_at) settled_before_opening,
     EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
      AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.movement_key=u.movement_key AND k.action='reconcile_duplicate')) duplicate_held
     FROM app.practice_feed_event e JOIN app.recovery_case_current c ON c.tenant_id=e.tenant_id AND c.job_id=e.job_id AND c.id=$3
     WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.movement_key='receipt-interest-120' AND e.identity='identified' AND e.event_kind IN('settled','pending')
     ORDER BY (e.event_kind='settled') DESC,e.created_at,e.id LIMIT 1`,[context.tenantId,job,input.caseId])).rows[0];
    interestSourceEventId=interest?.id;
    const interestResult=evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:context.tenantId,jobId:job,caseId:input.caseId,fixture:input.fixture,
     termsTiming:await termsTiming(interest?.id),payer:payer.payer,settlement:interest?.state==="settled"&&!interest.duplicate_held?"settled":"pending",paymentTiming:interest?.settled_before_opening?"before_opening":"after_opening",sourceRef:interest?.id??input.caseId});
    const lines=result.lines.map(line=>line.kind==="statutory_interest"?interestResult.lines.find(component=>component.kind==="statutory_interest")!:line);
    result=recoveryEligibilityViewV3.parse({...result,lines,qualifyingPrincipal:moneyFromBigInt(lines.reduce((sum,line)=>sum+BigInt(line.qualifyingPrincipal.pence),0n)),reason:lines.find(line=>line.reason!==null)?.reason??null});
   }
   if(definition.lines[0]!.netPence>Number(c.claim_pence))throw new RecoveryEligibilityV3Error("ELIGIBILITY_FIXTURE_MISMATCH");
   const id=randomUUID(),revision=(latest?.revision??0)+1;
   const inserted=await db.$client.query<{result_hash:string}>(`INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') result_hash`,[id,context.tenantId,job,input.caseId,revision,c.revision,input.fixture,event?.id??null,actor.membershipId,input.commandId,payloadHash,JSON.stringify(result)]);
   for(const line of result.lines)await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),context.tenantId,job,input.caseId,id,line.kind,line.debtorType,line.netPence]);
   await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${actor.membershipId}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:input.caseId,
    payload:{references:{jobId:job,reviewId:id,commandId:input.commandId,...(terms?{termsApprovalId:terms.id}:{}),...(event?{sourceEventId:event.id}:{}),...(interestSourceEventId?{interestSourceEventId}:{}),...(payer.paying_party_binding_id?{payingPartyBindingId:payer.paying_party_binding_id}:{}),...(payer.payer_mark_id?{payerMarkId:payer.payer_mark_id}:{})},hashes:{command:payloadHash,result:inserted.rows[0]!.result_hash},classifications:{recovery:"financial"}}}]);
   return {id,revision,caseRevision:c.revision,sourceEventId:event?.id??null,result};
  }).catch((error: unknown) => {
   // Known database pre-commit guards use the same typed refusal contract as the service.
   // Transport/commit ambiguity and deferred completeness defects retain the unknown outcome.
   const failure = error as { code?: unknown; message?: unknown } | null;
   const guards = ["ELIGIBILITY_REVIEWER_FORBIDDEN", "RECOVERY_JOB_NOT_FOUND", "RECOVERY_CASE_NOT_FOUND", "ELIGIBILITY_STALE_REVISION", "ELIGIBILITY_SOURCE_REQUIRED", "ELIGIBILITY_FIXTURE_MISMATCH", "ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE"];
   if (typeof failure?.code === "string" && typeof failure.message === "string" && guards.includes(failure.message)) {
    throw Object.assign(new Error(failure.message), { code: failure.message });
   }
   throw error;
  });
 }
}
