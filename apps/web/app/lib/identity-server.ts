import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createIdentityApplication, identityStatus, type IdentityApplication } from "@jobguard/api/identity";
const registry=globalThis as typeof globalThis & {__jobguardIdentityApplication?:IdentityApplication};
export function identityClientAddress(request: Request): string {
  // Only the deployment-selected Workers ingress may supply this identity.
  // Local/Node requests retain the shared fail-closed bucket, even with CF headers.
  const address = process.env.JOBGUARD_HOSTING === "cloudflare"
    ? request.headers.get("cf-connecting-ip") : null;
  if (!address) return "web-bootstrap";
  if (address.includes(":")) {
    // The web URL parser validates and canonicalizes a bracketed IPv6 literal.
    if (!/^[0-9a-f:.]+$/i.test(address)) return "web-bootstrap";
    try { return new URL(`http://[${address}]`).hostname.slice(1, -1); }
    catch { return "web-bootstrap"; }
  }
  const octets = address.split(".");
  return octets.length === 4 && octets.every(octet => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
    ? address : "web-bootstrap";
}
export function identityApplication() {
  // Never retain a Worker socket between requests; release closes the connection.
  if (process.env.JOBGUARD_HOSTING === "cloudflare") return createIdentityApplication(process.env,{max:1,maxUses:1});
  return registry.__jobguardIdentityApplication??=createIdentityApplication(process.env);
}
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
