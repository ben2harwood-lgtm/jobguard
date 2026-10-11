import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createWorkspaceApplication, SsoError, ssoSessionCookieOptions, ssoStatus } from "@jobguard/api/workspace";
import { identityApplication } from "../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../lib/synthetic-server";
const service=()=>createWorkspaceApplication({pool:syntheticPool(),identity:identityApplication()}).sso!;
export async function POST(request:Request,{params}:{params:Promise<{connectionId:string}>}) {
 const {connectionId}=await params;
 try {
  const application=service();
  if(request.headers.get('origin')!==application.allowedOrigin){await application.repository.refusal(connectionId,'SSO_FORBIDDEN');throw new SsoError('SSO_FORBIDDEN');}
  let raw:unknown;try{raw=await request.json();}catch{await application.refuseInput(connectionId);}
  const result=await application.callback(connectionId,raw,(await cookies()).get('jobguard_sso_state')?.value);
  const response=NextResponse.json({version:'sso-signed-in.v1',environment:'synthetic_demo',csrfToken:result.csrfToken,tenantId:result.tenantId},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set('jobguard_session',result.sessionToken,{...ssoSessionCookieOptions,maxAge:result.sessionLimitSeconds});
  response.cookies.set('jobguard_sso_state','',{httpOnly:true,secure:true,sameSite:'strict',path:'/api/auth/sso',maxAge:0});
  return response;
 }catch(error){const {code,status}=ssoStatus(error);return NextResponse.json({code},{status,headers:{'Cache-Control':'no-store'}});}
}
