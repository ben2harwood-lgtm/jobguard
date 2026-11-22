import { NextResponse } from "next/server";
import { identityCookieOptions, identityStatus } from "@jobguard/api/identity";
import { identityApplication, identityCredentials } from "../../../lib/identity-server";
import { pairingCookie, practiceCookieOptions } from "../../../lib/linked-practice-entry";
import { pilotIdentityRequest } from "../../../lib/pilot-identity-server";
export async function POST(request:Request) {
  if (globalThis.process?.env.JOBGUARD_ENV === "pilot_no_charge") return pilotIdentityRequest(request, async (app, credentials, reply) =>
    reply(await app.signout(credentials), ""));
  try {
    const result=await identityApplication().signout(await identityCredentials(request));
    const response=NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
    response.cookies.set("jobguard_session","",{...identityCookieOptions,maxAge:0});
    response.cookies.set("jg_session","",{...practiceCookieOptions(new URL(request.url).protocol === "https:"),maxAge:0});
    response.cookies.set(pairingCookie,"",{...practiceCookieOptions(new URL(request.url).protocol === "https:"),maxAge:0});
    return response;
  }catch(error){const {code,status}=identityStatus(error);return NextResponse.json({code},{status,headers:{"Cache-Control":"no-store"}});}
}
