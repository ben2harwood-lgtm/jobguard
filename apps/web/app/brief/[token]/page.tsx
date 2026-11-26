import "../../(designed)/design.css";
import "../../(designed)/design-fit.css";
import "../../(designed)/design-tools.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CrewLinkView } from "@jobguard/api/workspace";
import { crewLinkMode, linkCrewBriefs } from "../../lib/v2-crew-link-server";
import { BriefView } from "./view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My brief · JobGuard practice", referrer: "no-referrer",
  robots: { index: false, follow: false } };

// V2-F7M, no sign-in. The token reaches one trade's brief on one job and nothing else.
export default async function BriefPage({ params }: { params: Promise<{ token: string }> }) {
  if (!crewLinkMode()) notFound();
  const { token } = await params;
  let view: CrewLinkView | null = null;
  let failure: "refused" | "problem" | null = null;
  try { view = await linkCrewBriefs().open(token); }
  catch (error) { failure = error instanceof Error && error.message === "CREW_LINK_REFUSED" ? "refused" : "problem"; }
  return <BriefView token={token} view={view} failure={failure}/>;
}
