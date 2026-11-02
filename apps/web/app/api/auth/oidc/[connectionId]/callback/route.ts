import { NextResponse } from "next/server";
import { createWorkspaceApplication, oidcBrowserCookie, oidcCookieOptions } from "@jobguard/api/workspace";
import { identityApplication } from "../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../lib/synthetic-server";
const service=()=>createWorkspaceApplication({pool:syntheticPool(),identity:identityApplication()}).oidc!;
export async function POST(request:Request,{params}:{params:Promise<{connectionId:string}>}) {
 const {connectionId}=await params;
 try {
  const app=service();let raw:unknown;try{raw=await request.json();}catch{await app.refuseInput(connectionId);}
  const result=await app.callback(connectionId,raw,oidcBrowserCookie(request.headers.get('cookie')??undefined),request.headers.get('origin')??undefined);
  const response=NextResponse.json({version:'oidc-signed-in.v1',environment:'synthetic_demo',csrfToken:result.csrfToken,tenantId:result.tenantId},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set('jobguard_session',result.sessionToken,{...oidcCookieOptions,path:'/',maxAge:result.sessionLimitSeconds});
  response.cookies.set('jobguard_oidc_state','',{...oidcCookieOptions,maxAge:0});return response;
 }catch{return NextResponse.json({version:'oidc-error.v1',code:'OIDC_REFUSED'},{status:403,headers:{'Cache-Control':'no-store'}});}
}
