import { emergencyOwnerPost } from '@jobguard/api/workspace';
import { identityApplication, identityCredentials } from '../../../../../lib/identity-server';
export async function POST(request:Request,{params}:{params:Promise<{operation:string}>}) {
 try {
  const identity=identityApplication();
  return await emergencyOwnerPost(request,(await params).operation,await identityCredentials(request),
   identity.provider,identity.allowedOrigin,process.env.JOBGUARD_ENV as 'synthetic_demo');
 }catch{return Response.json({code:'SSO_EMERGENCY_REFUSED'},{status:403,headers:{'Cache-Control':'no-store'}});}
}
