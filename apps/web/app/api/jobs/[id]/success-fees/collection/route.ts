import { successFeeFailure } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
async function run(request:Request,params:Promise<{id:string}>,post:boolean){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")return NextResponse.json({code:"SYNTHETIC_MODE_REQUIRED"},{status:403,headers});
 try{
  const app=(await workspaceApplication()).successFees,id=(await params).id;
  const query=Object.fromEntries(new URL(request.url).searchParams);
  const selected=request.headers.has("x-tenant-id")||request.headers.has("x-jobguard-tenant-id");
  const result=post?await app.collect(id,()=>request.json(),query,selected):await app.collection(id,query,selected);
  return NextResponse.json(result,{headers});
 }catch(error){const failure=successFeeFailure(error);if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});throw error;}
}
export function GET(request:Request,{params}:{params:Promise<{id:string}>}){return run(request,params,false);}
export function POST(request:Request,{params}:{params:Promise<{id:string}>}){return run(request,params,true);}
