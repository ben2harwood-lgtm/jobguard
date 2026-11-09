import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { routeErrorCode } from "../../../../../../lib/route-error-code";
import { practiceFailure, hasSyntheticSession, syntheticPool } from "../../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";
import { z } from "zod";
import { inboxMetricEventV1 } from "@jobguard/core";

// Extend only this practice route; reject all caller-supplied event/authority fields.
const inboxDismissWithReasonV1 = z.object({
  version: z.literal("inbox-dismiss.v1"), commandId: z.guid(),
  reason: inboxMetricEventV1.options[2].shape.reason.optional(),
}).strict();

export async function POST(r: Request, { params }: { params: Promise<{ id: string; decisionId: string }> }) {
  const sessionId = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(sessionId)) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const { id, decisionId } = await params;
    const raw: unknown = await r.json();
    let command = raw;
    let reason: z.infer<typeof inboxDismissWithReasonV1>["reason"];
    // Preserve the existing application's validation/authorization order for legacy callers.
    if (raw !== null && typeof raw === "object" && "reason" in raw) {
      const parsed = inboxDismissWithReasonV1.parse(raw);
      reason = parsed.reason;
      command = { version: parsed.version, commandId: parsed.commandId };
    }
    const result = await (await workspaceApplication()).inboxRelevance.dismiss(id, decisionId, command);
    let metricFailure = false;
    if (reason && process.env.JOBGUARD_ENV === "synthetic_demo") {
      try {
        const { recordInboxDismissal } = await import("../../../../../../lib/inbox-metrics-server.js");
        await recordInboxDismissal(syntheticPool(), sessionId, id, decisionId, reason);
      }
      catch {
        metricFailure = true;
        console.error("INBOX_METRICS_RECORD_FAILED");
      }
    }
    return NextResponse.json(result, { headers: metricFailure ? { "X-Inbox-Metrics-Code": "INBOX_METRICS_RECORD_FAILED" } : {} });
  } catch (e) {
    const denied = practiceFailure(e); if (denied) return denied;
    const code = routeErrorCode(e, "INVALID_INBOX");
    return NextResponse.json({ code }, { status: code === "JOB_NOT_FOUND" ? 404 : code === "JOB_NOT_LIVE" || code === "IDEMPOTENCY_CONFLICT" ? 409 : code.includes("NOT_FOUND") ? 404 : 400 });
  }
}
