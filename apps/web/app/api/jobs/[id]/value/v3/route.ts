import { NextResponse } from "next/server";
import { CompanyValueApplication, subscriptionAuthority, valueV3Failure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";

import { ValueBusinessReader } from "@jobguard/db";
import { identityApplication, identityCredentials } from "../../../../../lib/identity-server";
import { syntheticPool } from "../../../../../lib/synthetic-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 try {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw Object.assign(new Error(), { code: "SYNTHETIC_MODE_REQUIRED" });
  const selectors=new URL(request.url).searchParams;
  const query=Object.fromEntries([...new Set(selectors.keys())].map(key=>
   [key,selectors.getAll(key).length===1?selectors.get(key):selectors.getAll(key)]));
  const company=request.headers.get("cookie")?.split(";").some(v=>v.trim().startsWith("jobguard_session="));
  const jobId=(await params).id;
  const result=company?await new CompanyValueApplication(subscriptionAuthority(identityApplication()),new ValueBusinessReader(syntheticPool())).readJob(
   {...await identityCredentials(request),origin:request.headers.get("origin")??identityApplication().allowedOrigin},jobId,query)
   :await (await workspaceApplication()).valueV3.readJob(jobId,query);
  return NextResponse.json(result, { headers });
 } catch (error) {
  const failure = valueV3Failure(error);
  return NextResponse.json(failure.body, { status: failure.status, headers });
 }
}
