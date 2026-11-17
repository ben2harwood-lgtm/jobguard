import { NextResponse } from "next/server";
import { subscriptionFailure, subscriptionHttpCommandV1, subscriptionHttpStatus } from "@jobguard/api/workspace";
import { identityCredentials } from "../../../lib/identity-server";
import { subscriptionApplication } from "../../../lib/subscription-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request) {
 try{
  const parsed=subscriptionHttpCommandV1.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({version:"subscription-error.v1",code:"INVALID_SUBSCRIPTION_INPUT"},{status:400,headers});
  return NextResponse.json(await subscriptionApplication().command(await identityCredentials(request),parsed.data.commandId,parsed.data.command),{status:201,headers});
 }catch(error){const body=subscriptionFailure(error);return NextResponse.json(body,{status:subscriptionHttpStatus(body.code),headers});}
}
