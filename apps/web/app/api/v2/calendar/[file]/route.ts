import { CalendarFeedApplication } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../lib/synthetic-server";
export const dynamic = "force-dynamic";
// V2-K2A bearer link for calendar apps, which fetch it from their own servers with no cookie or origin.
// The token is the only authority: no session is read, and the token is never logged.
const base = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
// Every failure is the same typed 404 (rule 29 refusal shape): unknown, malformed, revoked and non-practice alike.
const notFound = () => Response.json({ code: "NOT_FOUND" }, { status: 404, headers: base });
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo" || process.env.JOBGUARD_LOCAL_V2 !== "1") return notFound();
    const match = /^([A-Za-z0-9_-]{43})\.ics$/u.exec((await params).file);
    const body = match ? await new CalendarFeedApplication(syntheticPool()).calendar(match[1]!) : null;
    return body === null ? notFound() : new Response(body, { headers: { ...base,
      "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "inline; filename=\"jobguard-practice-plan.ics\"" } });
  } catch { return notFound(); }
}
