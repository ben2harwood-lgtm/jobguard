import { NextResponse } from "next/server";
import { subscriptionFailure, subscriptionHttpStatus } from "@jobguard/api/workspace";
import { identityApplication, identityCredentials } from "../../../lib/identity-server";
import { subscriptionApplication } from "../../../lib/subscription-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request) {
 try{return NextResponse.json(await subscriptionApplication().read({...await identityCredentials(request),origin:request.headers.get("origin")??identityApplication().allowedOrigin}),{headers});}
 catch(error){const body=subscriptionFailure(error);return NextResponse.json(body,{status:subscriptionHttpStatus(body.code),headers});}
}
