import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
const failure = (error: unknown) => {
  const { status, code } = workspaceApplication().evidencePacks.failure(error);
  return NextResponse.json({ code }, { status });
};
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await workspaceApplication().evidencePacks.list((await cookies()).get("jg_session")?.value, (await params).id)); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await workspaceApplication().evidencePacks.generate((await cookies()).get("jg_session")?.value, (await params).id, await request.json())); }
  catch (error) { return failure(error); }
}
