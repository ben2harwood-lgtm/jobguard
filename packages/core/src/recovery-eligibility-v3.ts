import { z } from "zod";
import { exactPence, parseExactPence, serializeExactPence, sumExactPence } from "./cumulative-fee.js";
import { moneyFromBigInt } from "./money.js";
import { createEligibilityFacts, evaluateRecoveryEligibility } from "./shadow-domain/eligibility.js";

export const recoveryEligibilityFixtureV3 = z.enum(["F14","F15","F16-partial","F16-full","F17","F18","F19","F20","F21","F22"]);
export type RecoveryEligibilityFixtureV3 = z.infer<typeof recoveryEligibilityFixtureV3>;
export const recoveryEligibilityCommandV3 = z.object({
 version:z.literal("recovery-eligibility-command.v3"), action:z.literal("review"), commandId:z.string().uuid(), caseId:z.string().uuid(),
 expectedCaseRevision:z.number().int().positive(), expectedReviewRevision:z.number().int().nonnegative(), fixture:recoveryEligibilityFixtureV3,
}).strict();
export const recoveryEligibilityFactsV3 = z.object({
 version:z.literal("recovery-eligibility-facts.v3"),environment:z.literal("synthetic_demo"),tenantId:z.string().uuid(),jobId:z.string().uuid(),caseId:z.string().uuid(),
 fixture:recoveryEligibilityFixtureV3,payer:z.enum(["not_insurer","insurer_unmarked","insurer_customer_own"]),settlement:z.enum(["settled","pending","unverified"]),
 interestSettlement:z.enum(["settled","pending","unverified"]).optional(),paymentTiming:z.enum(["before_opening","after_opening"]),sourceRef:z.string().min(1).max(300),
}).strict();
export class RecoveryEligibilityV3Error extends Error {
 constructor(readonly code:"INVALID_COMMAND"|"ELIGIBILITY_SOURCE_REQUIRED"|"ELIGIBILITY_FIXTURE_MISMATCH"|"ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE") {super(code);}
}
export const recoveryClaimLineKindV3 = z.enum(["principal","statutory_interest","fixed_compensation"]);
export const recoveryDebtorTypeV3 = z.enum(["business","individual"]);
/** Ben-approved message bytes. Round 2 preserves F21 null/held reasons; its constant is not activated. */
export const RECOVERY_NOT_COUNTED_WORDING_V1 = {
 individualInterest: "Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.",
 unpaidBillReduced: "Your supplier reduced a bill you hadn’t paid yet. That’s a saving, not money back in your account, so it isn’t counted as recovered money and there’s no fee on it.",
} as const;
export const recoveryEligibilityReasonV3 = z.enum([
 "Credit note below the £250 minimum","Credit note used against an invoice not yet paid in full",
 "Fixed statutory compensation is not part of the fee base","Paid before you opened this case",
 "Pending money cannot qualify","A manual payment record is not settlement evidence","Prevented spending is not recovered cash",
 "Insurer proceeds never qualify", RECOVERY_NOT_COUNTED_WORDING_V1.individualInterest, RECOVERY_NOT_COUNTED_WORDING_V1.unpaidBillReduced,
]);
export const recoveryEligibilityViewV3 = z.object({
 version:z.literal("recovery-eligibility-review.v3"),policyVersion:z.literal("reference_recovery_eligibility_policy_v3"),
 fixture:recoveryEligibilityFixtureV3,outcome:z.enum(["eligible_for_review","excluded"]),qualifyingPrincipal:z.object({pence:z.number().int().nonnegative().max(1_000_000_000_000),currency:z.literal("GBP")}).strict(),
 reason:recoveryEligibilityReasonV3.nullable(),reasonHeld:z.boolean(),terminal:z.boolean(),productionEnabled:z.literal(false),
 lines:z.array(z.object({kind:recoveryClaimLineKindV3,debtorType:recoveryDebtorTypeV3,netPence:z.number().int().nonnegative().max(1_000_000_000_000),qualifyingPrincipal:z.object({pence:z.number().int().nonnegative().max(1_000_000_000_000),currency:z.literal("GBP")}).strict(),reason:recoveryEligibilityReasonV3.nullable(),reasonHeld:z.boolean()}).strict()),
}).strict();
export type RecoveryEligibilityViewV3 = z.infer<typeof recoveryEligibilityViewV3>;
/** Fixed fictional claim components. These are proposals, never a client assertion, settlement, approval or allocation. */
export function recoveryFixtureDefinitionV3(fixture:RecoveryEligibilityFixtureV3) {
 const credit=["F14","F15","F16-partial","F16-full"].includes(fixture);
 const category=fixture==="F17"?"duplicate_supplier_payment":fixture==="F22"?"prevention":credit||fixture==="F21"?"merchant_overcharge":"withheld_customer_payment";
 const net=fixture==="F15"?20000:fixture==="F17"?45000:fixture==="F20"?32000:fixture==="F21"?9000:fixture==="F22"?32000:credit?30000:250000;
 const debtorType=fixture==="F19"?"individual" as const:"business" as const;
 const lines:Array<{kind:z.infer<typeof recoveryClaimLineKindV3>;netPence:number;debtorType:typeof debtorType}>=[{kind:"principal",netPence:net,debtorType}];
 if(fixture==="F18"||fixture==="F19")lines.push({kind:"statutory_interest",netPence:12000,debtorType},{kind:"fixed_compensation",netPence:7000,debtorType});
 return {category,credit,lines,movement:fixture==="F17"?"supplier-refund-540":fixture==="F20"?"receipt-384":"receipt-3000"} as const;
}
/** D03 v3 synthetic candidates only. The required payer fact is server-derived; terms authority is not created here.
 * SV-1's pure predicate receives its existing synthetic prerequisite assumptions for the fixture, not a stored terms approval.
 * No result authorizes pursuit or money posting. All category/line arithmetic comes from SV-1 and SH-1. */
export function evaluateRecoveryEligibilityV3(raw:unknown):RecoveryEligibilityViewV3 {
 const parsed=recoveryEligibilityFactsV3.safeParse(raw);if(!parsed.success)throw new RecoveryEligibilityV3Error("INVALID_COMMAND");
 const f=parsed.data,definition=recoveryFixtureDefinitionV3(f.fixture);
 // CH-7 owns refund timing; SV-1's supplier predicate has no timing input.
 // The repository supplies PostgreSQL's original-settlement <= opening decision.
 const refundBeforeOpening=definition.category==="duplicate_supplier_payment"&&f.paymentTiming==="before_opening";
 const lines=definition.lines.map((line,index)=>{
  // A claim component settles through its own receipt: statutory interest counts only when ITS receipt settled (F18). Absent a separate
  // fact the one principal settlement applies, which is exactly the earlier single-flag behaviour for every other fixture.
  const lineSettlement=line.kind==="statutory_interest"&&f.interestSettlement!==undefined?f.interestSettlement:f.settlement;
  const binding={tenantId:f.tenantId,jobId:f.jobId,workId:f.caseId,lineId:`${f.caseId}:${index}`};
  const base={version:"shadow-eligibility.v1",policyVersion:"reference_recovery_eligibility_policy_v3",environment:"synthetic_reference",...binding,caseId:f.caseId,approvedCase:true,unresolvedDispute:false,
   proof:{version:"shadow-settlement-proof.v1",...binding,status:lineSettlement==="settled"?"verified_settled":lineSettlement==="pending"?"pending":"unverified",sourceRef:f.sourceRef},
   origin:{version:"shadow-eligibility-origin.v1",...binding,kind:definition.category==="withheld_customer_payment"?"builder_opened_case":"approved_supplier_case",sourceRef:f.caseId},principalNet:serializeExactPence(exactPence(BigInt(line.netPence)))};
  const specifics=definition.category==="duplicate_supplier_payment"?{category:definition.category,doublePaymentEvidenced:true,refundForm:"cash"}:
   definition.category==="withheld_customer_payment"?{category:definition.category,builderOpened:true,feeTermsApprovedBeforePursuit:true,overdue:{version:"D03-overdue.v1",basis:"synthetic_fixture",thresholdMet:true,sourceRef:f.caseId},ownReminderResponse:"ignored",paymentTiming:f.fixture==="F20"?"before_opening":f.paymentTiming,proceeds:f.payer==="insurer_unmarked"?"insurer":"customer_cash",component:line.kind,debtor:line.debtorType}:
   definition.category==="prevention"?{category:definition.category}:{category:definition.category,mode:"applied_credit",credit:{consumedNetPence:line.netPence,laterInvoiceId:f.jobId,laterInvoicePayment:f.fixture==="F16-partial"?"partial":f.fixture==="F21"?"unpaid":"full",sourceRef:f.sourceRef}};
  const result=evaluateRecoveryEligibility(createEligibilityFacts({...base,...specifics}));
  const reason:RecoveryEligibilityViewV3["reason"]=f.fixture==="F22"?"Prevented spending is not recovered cash":
   refundBeforeOpening||f.fixture==="F20"||definition.category==="withheld_customer_payment"&&f.paymentTiming==="before_opening"?"Paid before you opened this case":
   definition.category==="withheld_customer_payment"&&f.payer==="insurer_unmarked"?"Insurer proceeds never qualify":
   line.kind==="fixed_compensation"?"Fixed statutory compensation is not part of the fee base":
   line.kind==="statutory_interest"&&line.debtorType==="individual"?RECOVERY_NOT_COUNTED_WORDING_V1.individualInterest:
   f.fixture==="F15"?"Credit note below the £250 minimum":f.fixture==="F16-partial"?"Credit note used against an invoice not yet paid in full":f.fixture==="F21"?null:
   lineSettlement==="pending"?"Pending money cannot qualify":lineSettlement==="unverified"?"A manual payment record is not settlement evidence":null;
  return {...line,qualifyingPrincipal:moneyFromBigInt(refundBeforeOpening?0n:parseExactPence(result.qualifyingPrincipal).numerator),reason,reasonHeld:f.fixture==="F21"};
 });
 const headerReason=f.fixture==="F19"||f.fixture==="F18"?(lines.find(l=>l.kind==="principal")?.reason??lines.find(l=>l.kind==="fixed_compensation")?.reason??null):lines.find(l=>l.reason!==null)?.reason??null;
 const q=sumExactPence(lines.map(l=>exactPence(BigInt(l.qualifyingPrincipal.pence))));
 return recoveryEligibilityViewV3.parse({version:"recovery-eligibility-review.v3",policyVersion:"reference_recovery_eligibility_policy_v3",fixture:f.fixture,outcome:q.numerator>0n?"eligible_for_review":"excluded",qualifyingPrincipal:moneyFromBigInt(q.numerator),reason:headerReason,reasonHeld:lines.some(l=>l.reasonHeld),terminal:f.fixture==="F22",productionEnabled:false,lines});
}
