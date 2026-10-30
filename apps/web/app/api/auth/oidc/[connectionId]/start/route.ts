import { NextResponse } from "next/server";
import { createWorkspaceApplication, oidcCookieOptions } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../lib/synthetic-server";
const service=()=>createWorkspaceApplication({pool:syntheticPool(),identity:identityApplication()}).oidc!;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request,{params}:{params:Promise<{connectionId:string}>}) {
 const {connectionId}=await params;
 try {
  const app=service();let raw:unknown;try{raw=await request.json();}catch{await app.refuseInput(connectionId);}
  const credentials=await identityCredentials(request);
  if(typeof raw==='object'&&raw!==null&&'version' in raw&&raw.version==='oidc-admin.v1')return reply(await app.admin(raw,credentials));
  const {browser,...result}=await app.start(connectionId,raw,credentials);
  const response=reply(result);response.cookies.set('jobguard_oidc_state',browser,oidcCookieOptions);return response;
 }catch{return reply({version:'oidc-error.v1',code:'OIDC_REFUSED'},403);}
}
