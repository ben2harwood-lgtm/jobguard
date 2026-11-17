import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createIdentityApplication, identityStatus, type IdentityApplication } from "@jobguard/api/identity";
const registry=globalThis as typeof globalThis & {__jobguardIdentityApplication?:IdentityApplication};
export function identityApplication() { return registry.__jobguardIdentityApplication??=createIdentityApplication(process.env); }
export async function identityReply(work:()=>Promise<unknown>) {
  try {return NextResponse.json(await work(),{headers:{"Cache-Control":"no-store"}});}
  catch(error) {const {code,status}=identityStatus(error);return NextResponse.json({code},{status,headers:{"Cache-Control":"no-store"}});}
}
export async function identityCredentials(request:Request) {
  return {sessionToken:(await cookies()).get("jobguard_session")?.value,origin:request.headers.get("origin")??undefined,csrfToken:request.headers.get("x-csrf-token")??undefined,tenantHeader:request.headers.get("x-tenant-id")??undefined};
}

export async function closeIdentityApplication() {
  const application=registry.__jobguardIdentityApplication;
  delete registry.__jobguardIdentityApplication;
  if(application)await application.provider.repository.pool.end();
}
