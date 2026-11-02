import { paymentFeeFailure } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
async function run(request:Request,params:Promise<{id:string}>,post:boolean){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")return NextResponse.json({code:"SYNTHETIC_MODE_REQUIRED"},{status:403,headers});
 try{
  const app=(await workspaceApplication()).paymentFees,id=(await params).id;
  const query=Object.fromEntries(new URL(request.url).searchParams);
  return NextResponse.json(post?await app.command(id,await request.json(),query):await app.get(id,query),{headers});
 }catch(error){
  const failure=paymentFeeFailure(error);
  if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});
  if(error instanceof SyntaxError)return NextResponse.json({code:"INVALID_PAYMENT_FEE_COMMAND"},{status:400,headers});
  throw error;
 }
}
export function GET(request:Request,{params}:{params:Promise<{id:string}>}){return run(request,params,false);}
export function POST(request:Request,{params}:{params:Promise<{id:string}>}){return run(request,params,true);}
