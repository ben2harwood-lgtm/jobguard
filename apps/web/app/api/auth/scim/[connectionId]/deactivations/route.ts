import { NextResponse } from "next/server";
import { createWorkspaceApplication, scimStatus, scimUnparsedBody } from "@jobguard/api/workspace";
import { identityApplication } from "../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../lib/synthetic-server";
export async function POST(request:Request,{params}:{params:Promise<{connectionId:string}>}) {
 try {
  const application=createWorkspaceApplication({pool:syntheticPool(),identity:identityApplication()}).scim!;
  const {connectionId}=await params;
  let raw:unknown;try{raw=await request.json();}catch{raw=scimUnparsedBody;}
  return NextResponse.json(await application.deactivate(connectionId,request.headers.get("authorization")??undefined,raw),{headers:{"Cache-Control":"no-store"}});
 }catch(error){const {code,status}=scimStatus(error);return NextResponse.json({code},{status,headers:{"Cache-Control":"no-store"}});}
}
