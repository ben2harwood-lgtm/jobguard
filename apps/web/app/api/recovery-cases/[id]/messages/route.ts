import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recoveryMessageError } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";

type Context = { params: Promise<{ id: string }> };
async function invoke(work: (sessionId: string | undefined) => Promise<unknown>) {
  try { return NextResponse.json(await work((await cookies()).get("jg_session")?.value)); }
  catch (error) {
    const { code, status } = recoveryMessageError(error);
    return NextResponse.json({ code }, { status });
  }
}
export async function GET(_request: Request, context: Context) {
  return invoke(async session => workspaceApplication().recoveryMessages.read(session, (await context.params).id));
}
export async function POST(request: Request, context: Context) {
  return invoke(async session => workspaceApplication().recoveryMessages.command(session, (await context.params).id, await request.json()));
}
