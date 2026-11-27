import { NextResponse } from "next/server";
import { identityCookieOptions, identityStatus } from "@jobguard/api/identity";
import { identityApplication } from "../../../lib/identity-server";
import { pilotIdentityRequest } from "../../../lib/pilot-identity-server";
export async function POST(request:Request) {
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return pilotIdentityRequest(request, async (app, credentials, reply) => {
    const session = await app.verify(await request.json(), credentials.origin, credentials);
    return reply({ version: "identity-verified.v1", environment: app.environment, csrfToken: session.csrfToken }, session.sessionToken);
  });
  try {
    const session=await identityApplication().verify(await request.json(),request.headers.get("origin")??undefined);
    const response=NextResponse.json({version:"identity-verified.v1",environment:"synthetic_demo",csrfToken:session.csrfToken},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set("jobguard_session",session.sessionToken,{...identityCookieOptions,maxAge:identityCookieOptions.maxAge/1000});
    return response;
  }catch(error){const {code,status}=identityStatus(error);return NextResponse.json({code},{status,headers:{"Cache-Control":"no-store"}});}
}
