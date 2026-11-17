import { z } from "zod";
import { calculateCumulativeFee, exactPence, formatRecoveryMessagePounds, parseExactPence, recoveryAttributionRevisionV1, serializeExactPence, sumExactPence } from "@jobguard/core";

export const attributionValueReceiptV1 = z.object({
 version:z.literal("attribution-value-receipt.v1"), assessmentId:z.string().uuid(),
 environment:z.literal("synthetic_demo"), productionEnabled:z.literal(false), realExternalActions:z.literal(0),
 label:z.literal("Illustration — proposed policy; principal only"),
 qualification:z.literal("unreviewed"), notice:z.literal("Practice sandbox — synthetic data; nothing is sent or charged"),
 taxStatus:z.literal("VAT not calculated"), recovered:z.object({numerator:z.string(),denominator:z.string()}).strict(),
 fee:z.object({pence:z.number().int().safe(),currency:z.literal("GBP")}).strict(),
 display:z.object({recovered:z.string().nullable(),fee:z.string(),yoursBeforeVatAndTax:z.string().nullable()}).strict(),
 yoursBeforeVatAndTax:z.object({numerator:z.string(),denominator:z.string()}).strict(),
}).strict();
/** One assessed catch, as of its immutable assessment. This never grants current
 * qualification, approves D03 review, or produces a fee obligation/posting. */
export function attributionValueReceipt(raw:unknown){
 const assessment=recoveryAttributionRevisionV1.parse(raw);
 const principal=assessment.assessmentOutcome==="eligible_for_review"?assessment.remainingPrincipal:{numerator:"0",denominator:"1"};
 const fee=calculateCumulativeFee({version:"cumulative-fee.v1",cumulativeQualifyingPrincipal:principal,
  rate:{version:"fee-rate.v1",policyVersion:"reference_fee_policy_v3",numerator:"1",denominator:"10"},
  priorNetPostedPence:0,priorPolicyVersion:"reference_fee_policy_v3",compensatesDerivationId:null}).cumulativeFee;
 const yours=serializeExactPence(sumExactPence([parseExactPence(principal),exactPence(-BigInt(fee.pence))]));
 const display=(value:typeof principal)=>{const p=parseExactPence(value);return p.numerator%p.denominator===0n?`£${formatRecoveryMessagePounds(Number(p.numerator/p.denominator))}`:null;};
 return attributionValueReceiptV1.parse({version:"attribution-value-receipt.v1",assessmentId:assessment.assessmentId,
  environment:"synthetic_demo",productionEnabled:false,realExternalActions:0,label:"Illustration — proposed policy; principal only",
  qualification:"unreviewed",notice:"Practice sandbox — synthetic data; nothing is sent or charged",taxStatus:"VAT not calculated",
  recovered:principal,fee,yoursBeforeVatAndTax:yours,display:{recovered:display(principal),fee:`£${formatRecoveryMessagePounds(fee.pence)}`,yoursBeforeVatAndTax:display(yours)}});
}
