import { NextResponse } from "next/server";
import { createWorkspaceApplication } from "@jobguard/api/workspace";
import { identityApplication } from "../../../../lib/identity-server";
import { syntheticPool } from "../../../../lib/synthetic-server";
const service=()=>createWorkspaceApplication({pool:syntheticPool(),identity:identityApplication()}).ssoRequired!;
export async function POST(request:Request) {
  try {
    let raw:unknown;try{raw=await request.json();}catch{await service().refuseInput(true);}
    return NextResponse.json(await service().emergency(raw,request.headers.get("origin")??undefined),{headers:{"Cache-Control":"no-store"}});
  }catch {return NextResponse.json({code:"SSO_EMERGENCY_REFUSED"},{status:403,headers:{"Cache-Control":"no-store"}});}
}
