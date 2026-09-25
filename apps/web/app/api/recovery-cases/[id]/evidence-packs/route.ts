import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
const failure = (error: unknown) => {
  const code = error instanceof Error ? error.message : "INVALID_COMMAND";
  return NextResponse.json({ code }, { status: code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code.includes("NOT_FOUND") ? 404 : /CONFLICT|STALE/u.test(code) ? 409 : 400 });
};
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await workspaceApplication().evidencePacks.list((await cookies()).get("jg_session")?.value, (await params).id)); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await workspaceApplication().evidencePacks.generate((await cookies()).get("jg_session")?.value, (await params).id, await request.json())); }
  catch (error) { return failure(error); }
}
