let nextId=0;
const randomUUID=()=>`a0000000-0000-4000-8000-${String(++nextId).padStart(12,"0")}`;
import { expect,it } from "vitest";
import { parsePaymentFeeCommand,PaymentFeeStatementError,paymentFeeStatementV1 } from "./payment-fee-statements.js";
const prepare={version:"payment-fee-command.v1",commandId:randomUUID(),action:"prepare",paymentId:randomUUID()};
it("MON-4A accepts intent only; fee, tenant, settlement, allocation and actor are server-owned",()=>{
 expect(parsePaymentFeeCommand(prepare)).toEqual(prepare);
 for(const key of ["feePence","principal","amount","tenantId","actorId","verified","sourceHash","authorizationId","policyVersion"])
  expect(()=>parsePaymentFeeCommand({...prepare,[key]:100})).toThrow(PaymentFeeStatementError);
 for(const raw of [null,{}, {...prepare,paymentId:"bad"},{...prepare,action:"collect"},{...prepare,action:"grant_standing_authority"}])
  expect(()=>parsePaymentFeeCommand(raw)).toThrow(PaymentFeeStatementError);
});
it("approval binds an exact statement hash; dispute only pauses and cannot resolve itself",()=>{
 const approval={version:prepare.version,commandId:randomUUID(),action:"approve",statementId:randomUUID(),statementHash:"a".repeat(64)};
 expect(parsePaymentFeeCommand(approval)).toEqual(approval);
 for(const statementHash of ["",null,"A".repeat(64)])expect(()=>parsePaymentFeeCommand({...approval,statementHash})).toThrow();
 expect(()=>parsePaymentFeeCommand({...approval,feePence:8000})).toThrow();
 const dispute={version:prepare.version,commandId:randomUUID(),action:"dispute",statementId:randomUUID()};
 expect(parsePaymentFeeCommand(dispute)).toEqual(dispute);
 expect(()=>parsePaymentFeeCommand({...dispute,action:"resolve_dispute"})).toThrow();
});
it("the statement boundary refuses negative, unsafe and production money",()=>{
 const doc={version:"payment-fee-statement.v1",statementId:randomUUID(),jobId:randomUUID(),paymentId:randomUUID(),statementHash:"a".repeat(64),sourceHash:"b".repeat(64),revision:1,
  qualifyingNet:{numerator:"80000",denominator:"1"},priorQualifyingNet:{numerator:"0",denominator:"1"},paymentReceivedPence:96000,feePence:8000,priorFeePence:0,cumulativeFeePence:8000,
  policyVersion:"reference_fee_policy_v3",environment:"synthetic_demo",productionEnabled:false,realExternalActions:0};
 expect(paymentFeeStatementV1.parse(doc)).toEqual(doc);
 for(const patch of [{feePence:-1},{feePence:1.5},{feePence:1000000000001},{environment:"production"},{productionEnabled:true},{realExternalActions:1}])expect(paymentFeeStatementV1.safeParse({...doc,...patch}).success).toBe(false);
});
