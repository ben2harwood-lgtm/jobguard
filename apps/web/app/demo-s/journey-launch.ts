import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { z } from "zod";
import { sessionResponseV1 } from "../lib/contracts";
import { parseShadowReport, shadowCaptureText } from "./shadow-30000/journey-model";

const captureAccessFailureV1 = z.object({ code: z.enum(["NOT_FOUND", "TENANT_FORBIDDEN", "UNAUTHENTICATED"]) });

/** A selection's server-issued identity is also its capture idempotency key.
 * Browser storage is never treated as evidence that a journey completed. */
export const recoverShadowCapture = (runId: string) => recoverCapture(runId, shadowCaptureText);
export async function recoverCapture(runId: string, text: string) {
  let response = await fetch("/api/session", { cache: "no-store" });
  if (response.status === 401) {
    const started = await fetch("/api/session", { method: "POST" });
    if (!started.ok) throw new Error("The practice workspace could not be started. Retry this selection.");
    response = await fetch("/api/session", { cache: "no-store" });
  }
  if (!response.ok) throw new Error("The practice workspace is unavailable. Retry this selection.");
  const session = sessionResponseV1.parse(await response.json());
  const tenantId = session.tenants[0]?.id;
  if (!tenantId) throw new Error("No practice business is available.");
  const unconfirmed = "Capture outcome unconfirmed. Retry this selection to recover the same request.";
  let captured: Response;
  try {
    captured = await fetch("/api/jobs/capture", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contractVersion: "job_capture_v1", requested_tenant_id: tenantId,
        captureId: runId, source: { kind: "text", text }, fixtureId: "deterministic-local-v1" }) });
  } catch {
    // A lost reply does not mean capture failed. Keep the saved selection's
    // identity so a reload/retry recovers the committed job rather than replacing it.
    throw new Error(unconfirmed);
  }
  const body: unknown = await captured.json().catch(() => null);
  if (!captured.ok) {
    const failure = captureAccessFailureV1.safeParse(body);
    if (failure.success) {
      const code = failure.data.code;
      if ((code === "NOT_FOUND" && [400, 404].includes(captured.status)) ||
          (code === "TENANT_FORBIDDEN" && captured.status === 403)) {
        throw new Error("This practice session cannot open the saved selection's job. Use Reset selection to start a new fictional job.");
      }
      if (code === "UNAUTHENTICATED" && captured.status === 401) {
        throw new Error("Restore or sign in to the appropriate practice session, then retry this selection to open its saved job.");
      }
    }
    throw new Error(unconfirmed);
  }
  const parsed = captureWorkspaceResponseV1.safeParse(body);
  if (!parsed.success) throw new Error(unconfirmed);
  const capture = parsed.data;
  if (capture.captureId !== runId) throw new Error("The saved capture does not match this selection.");
  return capture.jobId;
}
export async function readShadowResults(jobId: string) {
  const response = await fetch(`/api/jobs/${jobId}/shadow-demo`, { cache: "no-store" });
  if (!response.ok) throw new Error("Saved journey results are unavailable to this practice session.");
  return parseShadowReport(await response.json(), jobId);
}
