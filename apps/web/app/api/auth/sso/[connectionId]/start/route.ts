import { NextResponse } from "next/server";
import { createWorkspaceApplication, ssoStateCookieOptions, ssoStatus } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../lib/synthetic-server";
const service=()=>createWorkspaceApplication({pool:syntheticPool(),identity:identityApplication()}).sso!;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request) {
 try {return reply(await service().view(new URL(request.url).searchParams.get('requested_tenant_id')??'',{...await identityCredentials(request),origin:request.headers.get('origin')??identityApplication().allowedOrigin}));}
 catch(error){const {code,status}=ssoStatus(error);return reply({code},status);}
}
export async function POST(request:Request,{params}:{params:Promise<{connectionId:string}>}) {
 const {connectionId}=await params;
 try {
  let raw:unknown;try{raw=await request.json();}catch{await service().refuseInput(connectionId);}
  const credentials=await identityCredentials(request);
  if(typeof raw==='object'&&raw!==null&&'version' in raw&&raw.version==='sso-admin.v1')return reply(await service().admin(raw,credentials));
  const result=await service().start(connectionId,raw,credentials);
  const response=reply(result);response.cookies.set('jobguard_sso_state',result.relayState,{...ssoStateCookieOptions,maxAge:ssoStateCookieOptions.maxAge/1000});
  return response;
 }catch(error){const {code,status}=ssoStatus(error);return reply({code},status);}
}
