import { NextResponse } from "next/server";
import { builderFactReplies, builderOrigin, factReplyFailure, factReplyHeaders, factReplyMode } from "../../../../lib/v2-fact-reply-server";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

// V2 practice: the builder's replies section. Nothing here sends anything real.
export async function GET(_request: Request, { params }: RouteContext) {
  if (!factReplyMode()) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: factReplyHeaders });
  try { return NextResponse.json(await (await builderFactReplies()).read((await params).id), { headers: factReplyHeaders }); }
  catch (error) { return factReplyFailure(error); }
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!factReplyMode()) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: factReplyHeaders });
  if (!builderOrigin(request)) return NextResponse.json({ code: "ORIGIN_REFUSED" }, { status: 403, headers: factReplyHeaders });
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ code: "REPLY_INVALID_COMMAND" }, { status: 400, headers: factReplyHeaders }); }
  try { return NextResponse.json(await (await builderFactReplies()).command((await params).id, raw as never), { headers: factReplyHeaders }); }
  catch (error) { return factReplyFailure(error); }
}
