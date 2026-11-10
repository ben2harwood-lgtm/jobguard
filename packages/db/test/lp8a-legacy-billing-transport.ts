// Only the old BillingSql unit double uses this transport adapter. It models
// stored results/races, never SQL authorization or RLS. Real DB suites use the
// unchanged production client; lp8a-billing-revokes.test covers binding refusals.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { VerifiedTenantContext } from "../src/tenant-context.js";
type Billing = typeof import("../src/customer-billing-repository.js");
function transport(pool:Pool,context:VerifiedTenantContext,actor:string):Pool {
 return {connect:async()=>{
  const client=await pool.connect();let authorizationId:string|undefined,invoice:any;
  return {release:()=>client.release(),query:async(sql:string,values:any[]=[])=>{
   if(sql==="SELECT app.current_actor() actor, app.current_tenant() tenant")return {rows:[{actor,tenant:context.tenantId}]};
   if(sql.startsWith("SELECT semantic_key FROM app.command_receipt")){
    const found=await client.query("SELECT request_hash,status,result FROM app.command_receipt",[values[0],values[2],values[1],values[3]]);
    return{rows:found.rows.filter((row:any)=>row.status==="succeeded")};
   }
   if(sql.includes("app.issue_approved_customer_credit(")){
    const [command,invoiceId,amount,reason,pdf]=values,net=Number((BigInt(amount)*5n+3n)/6n),tax=Number((BigInt(net)+2n)/5n),id=randomUUID();
    const hash=(input:string|Buffer)=>createHash("sha256").update(input).digest("hex");
    const preview=hash(`${invoice.job_id??''}${invoiceId}${net}${invoice.credited}${invoice.pdf_sha256.trim()}`);
    await client.query("INSERT INTO app.customer_credit_note(id,tenant_id,job_id,invoice_id,authorization_id,credit_number,amount_pence,reason,net_pence,tax_pence,total_pence,source_invoice_hash,preview_hash,pdf_sha256,pdf_bytes,tax_policy_version,approved_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",[id,context.tenantId,invoice.job_id,invoiceId,authorizationId,`CN-${command}`,amount,reason,-net,-tax,-amount,invoice.pdf_sha256,preview,hash(pdf),pdf,invoice.tax_policy_version,new Date()]);
    return {rows:[{id}]};
   }
   const result=await client.query(sql,values);
   if(sql.startsWith("SELECT app.begin_command("))authorizationId=result.rows[0]?.result.authorizationId;
   if(sql.includes("FROM app.customer_invoice"))invoice={...result.rows[0],job_id:values[1]};
   return result;
  }};
 }} as unknown as Pool;
}
export function legacyBillingTransport(actual:Billing):Billing {
 class BillingTransport extends actual.CustomerBillingCommandService {
  constructor(private readonly sourcePool:Pool){super(sourcePool);}
  override credit(context:VerifiedTenantContext,raw:unknown){
   const input=actual.creditCustomerInvoiceV1.parse(raw);
   return new actual.CustomerBillingCommandService(transport(this.sourcePool,context,input.command.actorMembershipId)).credit(context,raw);
  }
  override recordPayment(context:VerifiedTenantContext,raw:unknown){
   const actor=(raw as {actorMembershipId:string}).actorMembershipId;
   return new actual.CustomerBillingCommandService(transport(this.sourcePool,context,actor)).recordPayment(context,raw);
  }
 }
 return {...actual,CustomerBillingCommandService:BillingTransport};
}
