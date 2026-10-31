import { NextResponse } from "next/server";
import { CompanyValueApplication, subscriptionAuthority, businessValueFailure, businessValueStatus } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../lib/workspace-server";

import { ValueBusinessReader } from "@jobguard/db";
import { identityApplication, identityCredentials } from "../../lib/identity-server";
import { syntheticPool } from "../../lib/synthetic-server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") {
  const result = businessValueFailure(Object.assign(new Error(), { code: "SYNTHETIC_MODE_REQUIRED" }));
  return NextResponse.json(result, { status: businessValueStatus(result), headers });
 }
 try {
  const params = new URL(request.url).searchParams;
  // Preserve repeated selectors as invalid arrays. Do not collapse them to the
  // last value before the shared service authenticates and validates selection.
  const query = Object.fromEntries([...new Set(params.keys())].map(key =>
   [key, params.getAll(key).length === 1 ? params.get(key) : params.getAll(key)]));
  const company = request.headers.get("cookie")?.split(";").some(v=>v.trim().startsWith("jobguard_session="));
  const result = company
   ? await new CompanyValueApplication(subscriptionAuthority(identityApplication()),new ValueBusinessReader(syntheticPool())).readBusiness({...await identityCredentials(request),origin:request.headers.get("origin")??identityApplication().allowedOrigin},query)
   : await (await workspaceApplication()).businessValue.readBusiness(query);
  return NextResponse.json(result, { status: businessValueStatus(result), headers });
 } catch (error) {
  const result = businessValueFailure(error);
  return NextResponse.json(result, { status: businessValueStatus(result), headers });
 }
}
