import { NextResponse } from "next/server";
import { identityCookieOptions, identityStatus } from "@jobguard/api/identity";
import { identityApplication, identityCredentials } from "../../../lib/identity-server";
export async function POST(request:Request) {
  try {
    const result=await identityApplication().signout(await identityCredentials(request));
    const response=NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
    response.cookies.set("jobguard_session","",{...identityCookieOptions,maxAge:0});
    return response;
  }catch(error){const {code,status}=identityStatus(error);return NextResponse.json({code},{status,headers:{"Cache-Control":"no-store"}});}
}
