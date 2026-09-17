import { z } from "zod";
import { addMoney, money, subtractMoney, type Money } from "./money.js";

export const CUSTOMER_INVOICE_POLICY_VERSION="candidate_m1_standard_v1" as const;
export const REAL_CUSTOMER_INVOICE_ISSUE_ENABLED=false as const;
export const SYNTHETIC_INVOICE_WATERMARK="SYNTHETIC - NOT A REAL INVOICE" as const;
export const PRACTICE_INVOICE_NUMBER_PREFIX="DEMO-CUST" as const;

export function formatPracticeCustomerInvoiceNumber(sequence:number):string{
 if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error("INVALID_INVOICE_SEQUENCE");
 return `${PRACTICE_INVOICE_NUMBER_PREFIX}-${sequence.toString().padStart(6,"0")}`;
}

const uuid=z.string().uuid();
export const customerPaymentV1=z.object({version:z.literal("customer-payment.record.v1"),commandId:uuid,actorMembershipId:uuid,jobId:uuid,invoiceId:uuid,paidOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),amountPence:z.number().int().positive(),currency:z.literal("GBP"),method:z.enum(["bank_transfer","cash","card_elsewhere","cheque","other"]),reference:z.string().trim().min(1).max(120),builderAttestsReceived:z.literal(true)}).strict();
export const customerPaymentReversalV1=z.object({version:z.literal("customer-payment.reverse.v1"),commandId:uuid,actorMembershipId:uuid,jobId:uuid,paymentId:uuid,reason:z.string().trim().min(1).max(240)}).strict();

export type CustomerInvoiceStatus="unpaid"|"partial"|"paid"|"credited";
export type InvoiceBalance=Readonly<{total:Money;credited:Money;received:Money;allocated:Money;unappliedCredit:Money;balance:Money;status:CustomerInvoiceStatus}>;

/** Deterministic, gap-display-safe format. Number reservation itself is serialized by PostgreSQL. */
export function formatCustomerInvoiceNumber(sequence:number,issuedOn:string):string{
 if(!Number.isSafeInteger(sequence)||sequence<1)throw new Error("INVALID_INVOICE_SEQUENCE");
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(issuedOn))throw new Error("INVALID_ISSUE_DATE");
 return `SYN-${issuedOn.slice(0,4)}-${sequence.toString().padStart(6,"0")}`;
}

/** Credits reduce debt first; receipts allocate only to the remaining debt, with excess kept separately. */
export function projectInvoiceBalance(input:{totalPence:number;creditPence?:number;receiptPence?:number;reversedReceiptPence?:number}):InvoiceBalance{
 const total=money(input.totalPence),credited=money(input.creditPence??0),received=money(input.receiptPence??0),reversed=money(input.reversedReceiptPence??0);
 if(credited.pence>total.pence||reversed.pence>received.pence)throw new Error("INVALID_CUSTOMER_BALANCE_HISTORY");
 const effectiveDebt=subtractMoney(total,credited),netReceived=subtractMoney(received,reversed);
 const allocated=money(Math.min(effectiveDebt.pence,netReceived.pence));
 const unappliedCredit=subtractMoney(netReceived,allocated),balance=subtractMoney(effectiveDebt,allocated);
 const status:CustomerInvoiceStatus=effectiveDebt.pence===0?"credited":balance.pence===0?"paid":allocated.pence>0?"partial":"unpaid";
 return Object.freeze({total,credited,received:netReceived,allocated,unappliedCredit,balance,status});
}

export function createSyntheticInvoicePdf(input:{invoiceNumber:string;issuerName:string;total:Money;sourceRevisionId:string;evidenceVersionIds:readonly string[]}):Uint8Array{
 const safe=(v:string)=>v.replace(/[()\\]/gu," ").replace(/[^\x20-\x7e]/gu,"?");
 const text=[SYNTHETIC_INVOICE_WATERMARK,`Invoice ${input.invoiceNumber}`,`Issuer: ${input.issuerName}`,`Total GBP ${(input.total.pence/100).toFixed(2)}`,`Source revision: ${input.sourceRevisionId}`,`Evidence versions: ${input.evidenceVersionIds.join(", ")||"none"}`].map(safe);
 const stream=`BT /F1 16 Tf 54 760 Td ${text.map((line,index)=>`${index?"0 -28 Td ":""}(${line}) Tj`).join(" ")} ET`;
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`];
 let pdf="%PDF-1.4\n",offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${n.toString().padStart(10,"0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(pdf);
}
