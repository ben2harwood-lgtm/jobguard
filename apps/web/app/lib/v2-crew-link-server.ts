import "server-only";
import { NextResponse } from "next/server";
import { CrewLinkError, CrewLinkPageApplication } from "@jobguard/api/workspace";
import { syntheticPool } from "./synthetic-server";

// V2-F7M. Copied from E2's v2-fact-reply-server.ts (claude/project-thread-49qd38 @ cf43ea480).
export const crewLinkHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

export function crewLinkMode() {
  return process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";
}

export function linkCrewBriefs() {
  return new CrewLinkPageApplication(syntheticPool());
}

// Crew-link POSTs (no sign-in): the launcher's configured origin only, never request.url or forwarded headers.
export function crewLinkOrigin(request: Request) {
  const origin = process.env.AUTH_ALLOWED_ORIGIN;
  return Boolean(origin) && request.headers.get("origin") === origin;
}

/** One refusal for every bad link; a changed brief and an invalid press are told apart, nothing else. */
export function crewLinkPageFailure(error: unknown) {
  if (error instanceof CrewLinkError) {
    if (error.code === "CREW_LINK_INVALID_COMMAND") return NextResponse.json({ code: error.code }, { status: 400, headers: crewLinkHeaders });
    if (error.code === "CREW_LINK_STALE") return NextResponse.json({ code: error.code }, { status: 409, headers: crewLinkHeaders });
    return NextResponse.json({ code: "CREW_LINK_REFUSED" }, { status: 404, headers: crewLinkHeaders });
  }
  return NextResponse.json({ code: "CREW_LINK_UNAVAILABLE" }, { status: 503, headers: crewLinkHeaders });
}
