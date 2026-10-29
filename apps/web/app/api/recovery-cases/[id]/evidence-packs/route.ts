import { practiceFailure } from "../../../../lib/synthetic-server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { workspaceApplication } from "../../../../lib/workspace-server";
const failure = async (error: unknown) => {
  const { status, code } = (await workspaceApplication()).evidencePacks.failure(error);
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
};
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const app = (await workspaceApplication()).evidencePacks;
    const read = new URL(request.url).searchParams.get("version") === "3" ? app.listV3 : app.list;
    return NextResponse.json(await read((await cookies()).get("jg_session")?.value, (await params).id), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) {const denied=practiceFailure(error);if(denied)return denied; return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await (await workspaceApplication()).evidencePacks.generate((await cookies()).get("jg_session")?.value, (await params).id, await request.json())); }
  catch (error) {const denied=practiceFailure(error);if(denied)return denied; return failure(error); }
}
