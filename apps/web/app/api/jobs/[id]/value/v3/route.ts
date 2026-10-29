import { NextResponse } from "next/server";
import { valueV3Failure } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../../lib/workspace-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 try {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw Object.assign(new Error(), { code: "SYNTHETIC_MODE_REQUIRED" });
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const result = await (await workspaceApplication()).valueV3.readJob((await params).id, query);
  return NextResponse.json(result, { headers });
 } catch (error) {
  const failure = valueV3Failure(error);
  return NextResponse.json(failure.body, { status: failure.status, headers });
 }
}
