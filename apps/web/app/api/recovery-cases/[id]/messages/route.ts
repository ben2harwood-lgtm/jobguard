import { practiceFailure } from "../../../../lib/synthetic-server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
const failure = async (error: unknown) => {
  const denied = practiceFailure(error);
  if (denied) return denied;
  const { status, code } = (await workspaceApplication()).recoveryMessages.failure(error);
  return NextResponse.json({ code }, { status });
};
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await (await workspaceApplication()).recoveryMessages.read((await cookies()).get("jg_session")?.value, (await params).id)); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await (await workspaceApplication()).recoveryMessages.preview((await cookies()).get("jg_session")?.value, (await params).id, await request.json())); }
  catch (error) { return failure(error); }
}
