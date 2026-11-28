import "server-only";
import { NextResponse } from "next/server";
import { HandoverLinkApplication, HandoverReleaseError } from "@jobguard/api/workspace";
import { syntheticPool } from "./synthetic-server";

// V2-G3. Copied from F7M's v2-crew-link-server.ts (itself E2's v2-fact-reply-server.ts).
export const handoverLinkHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

export function handoverLinkMode() {
  return process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";
}

export function linkHandover() {
  return new HandoverLinkApplication(syntheticPool());
}

// Link POSTs (no sign-in): the launcher's configured origin only, never request.url or forwarded headers.
export function handoverLinkOrigin(request: Request) {
  const origin = process.env.AUTH_ALLOWED_ORIGIN;
  return Boolean(origin) && request.headers.get("origin") === origin;
}

/** One refusal for every bad link; an invalid body is told apart, nothing else. */
export function handoverLinkFailure(error: unknown) {
  if (error instanceof HandoverReleaseError) {
    if (error.code === "HANDOVER_RELEASE_INVALID_COMMAND") return NextResponse.json({ code: error.code }, { status: 400, headers: handoverLinkHeaders });
    return NextResponse.json({ code: "HANDOVER_LINK_REFUSED" }, { status: 404, headers: handoverLinkHeaders });
  }
  return NextResponse.json({ code: "HANDOVER_LINK_UNAVAILABLE" }, { status: 503, headers: handoverLinkHeaders });
}
