import { successFeeFailure } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request,{params}:{params:Promise<{id:string;statementId:string}>}){
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")return NextResponse.json({code:"SYNTHETIC_MODE_REQUIRED"},{status:403,headers});
 try{
  const {id,statementId}=await params;
  const file=await (await workspaceApplication()).successFees.downloadStatement(id,statementId,Object.fromEntries(new URL(request.url).searchParams),request.headers.has("x-tenant-id")||request.headers.has("x-jobguard-tenant-id"));
  if(!file)return NextResponse.json({code:"NOT_FOUND"},{status:404,headers});
  return new Response(file.canonicalJson,{headers:{...headers,"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="${file.filename}"`,"X-Content-SHA256":file.documentHash}});
 }catch(error){const failure=successFeeFailure(error);if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});throw error;}
}
