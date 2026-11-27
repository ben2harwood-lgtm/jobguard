import "../../(designed)/design.css";
import "../../(designed)/design-fit.css";
import "../../(designed)/design-tools.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReplyLinkView } from "@jobguard/api/workspace";
import { factReplyMode, linkFactReplies } from "../../lib/v2-fact-reply-server";
import { ReplyView } from "./view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "One question · JobGuard practice", referrer: "no-referrer",
  robots: { index: false, follow: false } };

// V2 only, no sign-in. The token reaches one question and nothing else.
export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  if (!factReplyMode()) notFound();
  const { token } = await params;
  let view: ReplyLinkView | null = null;
  let failure: "refused" | "problem" | null = null;
  try { view = await linkFactReplies().open(token); }
  catch (error) { failure = error instanceof Error && error.message === "REPLY_LINK_REFUSED" ? "refused" : "problem"; }
  return <ReplyView token={token} view={view} failure={failure}/>;
}
