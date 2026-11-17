import { successFeeFailure } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../lib/workspace-server";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const headers={"Cache-Control":"no-store"};
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")return NextResponse.json({code:"SYNTHETIC_MODE_REQUIRED"},{status:403,headers});
 try{
  const app=(await workspaceApplication()).successFees,id=(await params).id;
  const result=await app.reconcileMoney(id,()=>request.json(),Object.fromEntries(new URL(request.url).searchParams),request.headers.has("x-tenant-id")||request.headers.has("x-jobguard-tenant-id"));
  return NextResponse.json(result,{headers});
 }catch(error){const failure=successFeeFailure(error);if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});throw error;}
}
