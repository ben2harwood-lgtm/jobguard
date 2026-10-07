import { practiceFailure } from "../../../../lib/synthetic-server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
const failure = async (error: unknown) => {
  const { status, code } = (await workspaceApplication()).evidencePacks.failure(error);
  return NextResponse.json({ code }, { status });
};
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await (await workspaceApplication()).evidencePacks.list((await cookies()).get("jg_session")?.value, (await params).id)); }
  catch (error) {const denied=practiceFailure(error);if(denied)return denied; return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await (await workspaceApplication()).evidencePacks.generate((await cookies()).get("jg_session")?.value, (await params).id, await request.json())); }
  catch (error) {const denied=practiceFailure(error);if(denied)return denied; return failure(error); }
}
