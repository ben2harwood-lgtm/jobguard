import { NextResponse } from 'next/server';
import { createWorkspaceApplication, ssoRequiredStatus } from '@jobguard/api/workspace';
import { identityApplication, identityCredentials } from '../../../../lib/identity-server';
import { syntheticPool } from '../../../../lib/synthetic-server';
export async function GET(request:Request) {
 const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
 try {
  const service=createWorkspaceApplication({pool:syntheticPool(),identity:identityApplication()}).ssoRequired!;
  return reply(await service.emergencyNotices(Object.fromEntries(new URL(request.url).searchParams),
   {...await identityCredentials(request),origin:request.headers.get('origin')??identityApplication().allowedOrigin}));
 }catch(error){const {code,status}=ssoRequiredStatus(error);return reply({code},status);}
}
