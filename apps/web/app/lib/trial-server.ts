import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { FreeFirstJobLifecycleApplication, trialHttpFailure } from "@jobguard/api/trial";
import { identityApplication, identityCredentials } from "./identity-server";
import { identityStatus } from "@jobguard/api/identity";
import { syntheticPool } from "./synthetic-server";
export async function trialReply(request:Request,jobId:string,action:"read"|"command"|"activate"){
 const headers={"Cache-Control":"no-store"};
 try{
  const credentials=await identityCredentials(request);
  // GET does not send Origin on same-origin fetches; credentials still require
  // the current session's CSRF token and explicitly selected company.
  if(action==="read")credentials.origin??=new URL(request.url).origin;
  const app=new FreeFirstJobLifecycleApplication(syntheticPool(),identityApplication());
  if(action==="read")return NextResponse.json(await app.read(credentials,jobId,Object.fromEntries(new URL(request.url).searchParams)),{headers});
  const body:unknown=await request.json();
  return NextResponse.json(action==="activate"?await app.activate(credentials,jobId,body):await app.command(credentials,jobId,body),{headers});
 }catch(error){
  const failure=trialHttpFailure(error);if(failure)return NextResponse.json(failure.body,{status:failure.status,headers});
  if(error instanceof ZodError||error instanceof SyntaxError)return NextResponse.json({code:"INVALID_FREE_FIRST_JOB_INPUT"},{status:400,headers});
  const failureIdentity=identityStatus(error);return NextResponse.json({code:failureIdentity.code},{status:failureIdentity.status,headers});
 }
}
