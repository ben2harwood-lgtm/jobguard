import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FactReminderApplication, FactReplyApplication } from "@jobguard/api/workspace";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";
import { practiceFailure, syntheticPool } from "./synthetic-server";
import { routeErrorCode } from "./route-error-code";

export const factReplyHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

export function factReplyMode() {
  return process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";
}

export async function builderFactReplies() {
  return new FactReplyApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
}

// V2-E7: the builder's "Run reminders now (practice)" press and its rows.
export async function builderFactReminders() {
  return new FactReminderApplication(syntheticPool(), (await cookies()).get("jg_session")?.value);
}

export function linkFactReplies() {
  return new FactReplyApplication(syntheticPool());
}

// Customer-link POSTs (no sign-in). Copied from F6's extraLinkOrigin (v2-extra-link-server.ts on
// codex/sandbox/v2-f6): the launcher's configured origin only, never request.url or forwarded headers.
export function replyLinkOrigin(request: Request) {
  const origin = process.env.AUTH_ALLOWED_ORIGIN;
  return Boolean(origin) && request.headers.get("origin") === origin;
}

// Signed-in builder POSTs: the configured-origin gate (rule 21).
export function builderOrigin(request: Request) {
  return isTrustedBrowserOrigin(request);
}

const statusOf = (code: string) => code === "REPLY_COMMAND_CONFLICT" || code.endsWith("_VERSION_CONFLICT") ||
  code === "REPLY_OUT_OF_DATE" || code === "REPLY_CLOSED" || code === "REPLY_FACT_CLOSED" || code === "REPLY_ALREADY_ANSWERED" ||
  code.startsWith("OPEN_FACT_") ? 409 : 400;

export function factReplyFailure(error: unknown) {
  const denied = practiceFailure(error);
  if (denied) return denied;
  const code = routeErrorCode(error, "REPLY_INVALID_COMMAND");
  if (!code.startsWith("REPLY_") && !code.startsWith("OPEN_FACT_")) {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers: factReplyHeaders });
  }
  return NextResponse.json({ code }, { status: statusOf(code), headers: factReplyHeaders });
}

// V2-E7 failures: a replayed command id with other content conflicts; other reminder
// codes are the caller's; anything else hides its database detail.
export function factReminderFailure(error: unknown) {
  const denied = practiceFailure(error);
  if (denied) return denied;
  const code = routeErrorCode(error, "REMINDER_INVALID_COMMAND");
  if (!code.startsWith("REMINDER_")) {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers: factReplyHeaders });
  }
  return NextResponse.json({ code }, { status: code === "REMINDER_COMMAND_CONFLICT" ? 409 : 400, headers: factReplyHeaders });
}
