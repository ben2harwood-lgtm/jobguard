import { NextResponse } from "next/server";
import { factReplyHeaders, factReplyMode, linkFactReplies, replyLinkOrigin } from "../../../lib/v2-fact-reply-server";

export const dynamic = "force-dynamic";

// The no-sign-in reply page's one write. The token travels in the body, not the path.
// Every refusal looks the same, so the page reveals nothing about other links.
export async function POST(request: Request) {
  if (!factReplyMode() || !replyLinkOrigin(request)) {
    return NextResponse.json({ code: "REPLY_LINK_REFUSED" }, { status: 404, headers: factReplyHeaders });
  }
  try {
    const { token, ...input } = await request.json() as { token?: unknown };
    if (typeof token !== "string") throw new Error("REPLY_LINK_REFUSED");
    return NextResponse.json(await linkFactReplies().receive(token, input), { headers: factReplyHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "REPLY_ANSWER_INVALID" || code === "REPLY_ALREADY_ANSWERED") {
      return NextResponse.json({ code }, { status: code === "REPLY_ANSWER_INVALID" ? 400 : 409, headers: factReplyHeaders });
    }
    if (code === "REPLY_LINK_REFUSED") return NextResponse.json({ code }, { status: 404, headers: factReplyHeaders });
    return NextResponse.json({ code: "REPLY_UNAVAILABLE" }, { status: 503, headers: factReplyHeaders });
  }
}
