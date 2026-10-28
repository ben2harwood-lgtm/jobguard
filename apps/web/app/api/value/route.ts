import { NextResponse } from "next/server";
import { businessValueFailure, businessValueStatus } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../lib/workspace-server";

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
  const result = await (await workspaceApplication()).businessValue.readBusiness(query);
  return NextResponse.json(result, { status: businessValueStatus(result), headers });
 } catch (error) {
  const result = businessValueFailure(error);
  return NextResponse.json(result, { status: businessValueStatus(result), headers });
 }
}
