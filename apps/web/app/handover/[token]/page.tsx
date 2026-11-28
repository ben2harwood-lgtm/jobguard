import "../../(designed)/design.css";
import "../../(designed)/design-fit.css";
import "../../(designed)/design-tools.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { HandoverLinkView } from "@jobguard/api/workspace";
import { handoverLinkMode, linkHandover } from "../../lib/v2-handover-link-server";
import { CustomerPackView } from "./view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your handover pack · JobGuard practice", referrer: "no-referrer",
  robots: { index: false, follow: false } };

// V2-G3, no sign-in. The token opens one released handover version and nothing else.
export default async function HandoverLinkPage({ params }: { params: Promise<{ token: string }> }) {
  if (!handoverLinkMode()) notFound();
  const { token } = await params;
  let view: HandoverLinkView | null = null;
  let failure: "refused" | "problem" | null = null;
  try { view = await linkHandover().open(token); }
  catch (error) { failure = error instanceof Error && error.message === "HANDOVER_LINK_REFUSED" ? "refused" : "problem"; }
  // A refused page carries no token.
  return <CustomerPackView token={view ? token : ""} view={view} failure={failure}/>;
}
