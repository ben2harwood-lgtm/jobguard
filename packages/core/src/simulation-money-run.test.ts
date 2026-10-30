import { expect,it } from "vitest";
import { reconcileSimulationMoney,simulationMoneyHash,simulationMoneyCommandV1,simulationMoneySnapshotV1 } from "./simulation-money-run.js";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export function fixture(){
 const s:Record<string,unknown>={version:"simulation-money-snapshot.v1",tenantId:id(1),jobId:id(2),liveFee:{feePence:3200,qualifyingPrincipal:{numerator:"32000",denominator:"1"}}};
 for(const key of ["practice_feed_event","practice_feed_receipt_match","practice_feed_command","customer_invoice","customer_credit_note","customer_payment","customer_payment_reversal","receipt_allocation_fact_revision","receipt_allocation_fact_source","receipt_allocation_fact_line","stored_receipt_case_allocation","success_fee_derivation","success_fee_journal","success_fee_journal_line","platform_fee_statement","platform_fee_attempt","platform_fee_attempt_event","subscription_period","subscription_period_line","platform_statement","platform_statement_line","subscription_simulated_work","subscription_simulated_result"])s[key]=[];
 Object.assign(s,{
 customer_invoice:[{id:id(3),total_pence:2256000}],
 receipt_allocation_fact_revision:[{id:id(4),payment_id:id(5),direction:"receipt"}],
 customer_payment:[{id:id(5),invoice_id:id(3),amount_pence:38400}],
 receipt_allocation_fact_source:[{id:id(6),allocation_revision_id:id(4),payment_id:id(5),invoice_id:id(3)}],
 receipt_allocation_fact_line:[{id:id(7),source_id:id(6),net_numerator:"32000",net_denominator:"1",gross_numerator:"38400",gross_denominator:"1"}],
 stored_receipt_case_allocation:[{id:id(8),fact_line_id:id(7),net_numerator:"32000",net_denominator:"1"}],
 success_fee_derivation:[{id:id(9),revision:1,fee_pence:28200,delta_pence:28200},{id:id(10),revision:2,fee_pence:3200,delta_pence:-25000}],
 success_fee_journal:[{id:id(11),derivation_id:id(9),amount_pence:28200},{id:id(12),derivation_id:id(10),amount_pence:-25000}],
 success_fee_journal_line:[{journal_id:id(11),account:"fee_receivable",side:"debit",amount_pence:28200},{journal_id:id(11),account:"fee_income",side:"credit",amount_pence:28200},{journal_id:id(12),account:"fee_receivable",side:"credit",amount_pence:25000},{journal_id:id(12),account:"fee_income",side:"debit",amount_pence:25000}],
 platform_fee_statement:[{id:id(13),document_hash:"a".repeat(64)}],
 platform_fee_attempt:[{id:id(14),statement_id:id(13),kind:"collection",amount_pence:28200},{id:id(15),statement_id:id(13),kind:"refund",amount_pence:25000}],
 platform_fee_attempt_event:[{attempt_id:id(14),revision:1,state:"pending"},{attempt_id:id(14),revision:2,state:"settled"},{attempt_id:id(15),revision:1,state:"pending"},{attempt_id:id(15),revision:2,state:"settled"}],
 });
 return simulationMoneySnapshotV1.parse(s);
}
it("derives target balances from explicit history; this reference is not a database compensation writer",()=>{
 const report=reconcileSimulationMoney(fixture());expect(report).toMatchObject({label:"Records match within this simulation",unresolvedDifferenceCount:0,customer:{invoiceBalancePence:2217600},successFee:{postedPence:3200,refundedPence:25000,retainedPence:3200,yoursBeforeTax:{numerator:"28800",denominator:"1"}},realExternalActions:0});
});
it("shows specific orphan, duplicate, late and unknown rows without discarding history",()=>{
 const s=fixture();s.platform_fee_attempt_event.push({attempt_id:id(90),revision:1,state:"settled"});
 s.platform_fee_attempt_event.push({...s.platform_fee_attempt_event[0]!});
 s.platform_fee_attempt_event.push({attempt_id:id(14),revision:3,state:"outcome_unknown"});
 const before=JSON.stringify(s),report=reconcileSimulationMoney(s);
 expect(report.label).toBe("Review needed");expect(report.differences.map(d=>d.code)).toEqual(expect.arrayContaining(["ORPHAN_EVENT","DUPLICATE_ROW","LATE_OR_INVALID_EVENT","OUTCOME_UNKNOWN"]));expect(JSON.stringify(s)).toBe(before);
});
it("exposes missing reversal compensation instead of returning a matching retained amount as posted",()=>{
 const s=fixture();s.success_fee_derivation.pop();s.success_fee_journal.pop();s.success_fee_journal_line=s.success_fee_journal_line.slice(0,2);
 expect(reconcileSimulationMoney(s)).toMatchObject({label:"Review needed",successFee:{postedPence:28200,retainedPence:3200}});
 expect(reconcileSimulationMoney(s).differences.map(d=>d.code)).toContain("FEE_COMPENSATION_REQUIRED");
});
it("missing sources never become an empty match and negative balances are not clamped",()=>{
 const s=fixture();s.liveFee=null;s.customer_payment[0]!.amount_pence=3000000;
 expect(reconcileSimulationMoney(s)).toMatchObject({label:"Review needed",customer:{invoiceBalancePence:-744000}});
});
it("subscription is an independent book; redirects and unknown results are not settlement",()=>{
 const s=fixture();s.subscription_period=[{id:id(20),principal_pence:2900}];s.subscription_period_line=[{period_id:id(20),line_key:"plan",amount_pence:2900}];s.platform_statement=[{id:id(21),period_id:id(20),amount_pence:2900}];s.platform_statement_line=[{statement_id:id(21),period_id:id(20),line_key:"plan",amount_pence:2900}];s.subscription_simulated_work=[{id:id(22),statement_id:id(21),amount_pence:2900}];s.subscription_simulated_result=[{id:id(23),work_id:id(22),outcome:"redirect"}];
 expect(reconcileSimulationMoney(s)).toMatchObject({label:"Review needed",subscription:{principalPence:2900,settledPence:0},successFee:{postedPence:3200}});
 s.subscription_simulated_result.push({id:id(24),work_id:id(22),outcome:"settled"});expect(reconcileSimulationMoney(s).unresolvedDifferenceCount).toBe(0);
});
it("stable hashes survive JSON checkpoint round trips; changed sources differ and command facts are forbidden",()=>{
 const s=fixture(),report=reconcileSimulationMoney(s);expect(reconcileSimulationMoney(JSON.parse(JSON.stringify(s)))).toEqual(report);
 expect(simulationMoneyHash({b:2,a:1})).toBe(simulationMoneyHash({a:1,b:2}));
 expect(simulationMoneyHash({})).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
 expect(simulationMoneyCommandV1.safeParse({version:"simulation-money-command.v1",commandId:id(1),action:"run",snapshot:s}).success).toBe(false);
});

it("allocation caps and invoice identity are checked against receipt rows",()=>{
 const s=fixture();s.customer_payment[0]!.amount_pence=1;s.receipt_allocation_fact_source[0]!.invoice_id=id(99);
 expect(reconcileSimulationMoney(s).differences.map(d=>d.code)).toEqual(expect.arrayContaining(["ALLOCATION_EXCEEDS_RECEIPT","CROSS_INVOICE_ALLOCATION"]));
});

it("persisted incoming feed anomalies retain their row references until the original duplicate review command exists",()=>{
 const s=fixture();s.practice_feed_event=[{id:id(80),event_id:"unknown-receipt-3000",movement_key:"receipt-3000",state:"possible_duplicate",identity:"unidentified"},{id:id(81),event_id:"settled-receipt-3000",movement_key:"receipt-3000",state:"settled",identity:"identified"}];
 const report=reconcileSimulationMoney(s);expect(report.differences.map(d=>d.code)).toEqual(expect.arrayContaining(["UNKNOWN_FEED_EVENT","POSSIBLE_DUPLICATE_EVENT","ORPHAN_FEED_EVENT"]));expect(report.differences.some(d=>d.sourceRefs.includes(id(80)))).toBe(true);
 s.practice_feed_command.push({id:id(82),action:"reconcile_duplicate",movement_key:"receipt-3000"});expect(reconcileSimulationMoney(s).differences.map(d=>d.code)).not.toContain("POSSIBLE_DUPLICATE_EVENT");
});
