import { z } from "zod";
const uuid=z.string().uuid();
const pence=z.number().int().positive().max(1_000_000_000_000);
const base={version:z.literal("practice-allocation-command.v1"),commandId:uuid,expectedRevision:z.number().int().nonnegative()};
export const practiceAllocationCommandV1=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("prepare"),invoiceId:uuid,caseIds:z.tuple([uuid,uuid]),evidenceIds:z.tuple([uuid,uuid])}).strict(),
 z.object({...base,action:z.literal("approve"),movementId:uuid,representationId:z.string().min(1).max(200),caseId:uuid,evidenceId:uuid,netPence:pence}).strict(),
 z.object({...base,action:z.literal("reverse"),allocationId:uuid,netPence:pence}).strict(),
 z.object({...base,action:z.literal("invalidate_evidence"),allocationId:uuid}).strict(),
 z.object({...base,action:z.literal("dispute"),allocationId:uuid}).strict(),
]);
export const practiceAllocationQueryV1=z.object({version:z.literal("practice-allocation-query.v1")}).strict();
export type PracticeAllocationCommand=z.infer<typeof practiceAllocationCommandV1>;
/** Reference VAT only. Ambiguous fractional-penny attribution stays held rather than inventing tax. */
export function referenceAllocationAmounts(netPence:number){
 pence.parse(netPence);const net=BigInt(netPence);
 if(net%5n!==0n)throw new Error("ALLOCATION_TAX_BASIS_UNCERTAIN");
 const tax=net/5n,gross=net+tax;if(gross>1_000_000_000_000n)throw new Error("ALLOCATION_AMOUNT_INVALID");
 return {netPence,taxPence:Number(tax),grossPence:Number(gross)};
}
export type PracticeAllocationView={version:"practice-allocation-view.v1";environment:"synthetic_demo";jobId:string;revision:number;prepared:boolean;landing:"Simulated";realExternalActions:0;
 recoveryGrossMovementsPence:number;eligibleNetPence:number;allocatedTaxPence:number;customerInvoiceBalancePence:number|null;feeExecutionState:"Ready — simulated"|"Paused — recovery changed";
 invoiceId:string|null;invoices:Array<{id:string;number:string;totalPence:number}>;cases:Array<{id:string;claimedNetPence:number;book:string;sourceRefs:string[];landedNetPence:number;outstandingNetPence:number;state:string}>;
 evidence:Array<{id:string;sha256:string;objectVersionId:string}>;
 movements:Array<{id:string;underlyingMovementId:string;grossPence:number;remainingGrossPence:number;availableGrossPence:number;representations:string[];sourceHash:string;state:"settled"|"reversed"}>;
 allocations:Array<{id:string;movementId:string;caseId:string;evidenceId:string;netPence:number;taxPence:number;grossPence:number;reversedNetPence:number;eligible:boolean;policyVersion:string;reviewerRef:string}>;
 events:Array<{id:string;allocationId:string;kind:"reverse"|"invalidate_evidence"|"dispute";netPence:number;taxPence:number;grossPence:number}>;
};
