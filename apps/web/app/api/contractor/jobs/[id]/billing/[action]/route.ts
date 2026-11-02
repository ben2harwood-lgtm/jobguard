import "server-only";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import {BillingApplication,billingHttpFailure} from "@jobguard/api/workspace";
import {ContractorBillingError} from "@jobguard/core";
import {syntheticPool} from "../../../../../../lib/synthetic-server";
import {isTrustedBrowserOrigin} from "../../../../origin";
export async function POST(request:Request,context:{params:Promise<{id:string;action:string}>}){
 const headers={"cache-control":"no-store"};
 try{
  if(!isTrustedBrowserOrigin(request))throw new ContractorBillingError("BILLING_FORBIDDEN");
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new ContractorBillingError("MODE_FORBIDDEN");
  const {id,action}=await context.params,session=(await cookies()).get("jg_session")?.value,app=new BillingApplication(syntheticPool());
  let raw:unknown;try{raw=await request.json();}catch{throw new ContractorBillingError("BILLING_INVALID");}
  const result=action==="export"?await app.finalise(session,id,raw):action==="import"?await app.import(session,id,raw):action==="approve-delivery"?await app.approveDelivery(session,id,raw):action==="advance-delivery"?await app.advance(session,id,raw):(()=>{throw new ContractorBillingError("BILLING_INVALID");})();
  return NextResponse.json(result,{headers});
 }catch(e){const f=billingHttpFailure(e);return NextResponse.json(f.body,{status:f.status,headers});}
}
export async function GET(request:Request,context:{params:Promise<{id:string;action:string}>}){
 const headers={"cache-control":"no-store","content-type":"text/csv; charset=utf-8"};
 try{
  const {id,action}=await context.params;if(action!=="download")throw new ContractorBillingError("BILLING_NOT_FOUND");
  const result=await new BillingApplication(syntheticPool()).download((await cookies()).get("jg_session")?.value,id,new URL(request.url).searchParams.get("batchId"));
  return new Response(result.csv,{headers:{...headers,"x-content-sha256":result.hash}});
 }catch(e){const f=billingHttpFailure(e);return NextResponse.json(f.body,{status:f.status,headers:{"cache-control":"no-store"}});}
}
