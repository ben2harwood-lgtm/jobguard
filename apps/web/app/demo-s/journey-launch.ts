import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { sessionResponseV1 } from "../lib/contracts";
import { parseShadowReport, shadowCaptureText } from "./shadow-30000/journey-model";

/** A selection's server-issued identity is also its capture idempotency key.
 * Browser storage is never treated as evidence that a journey completed. */
export async function recoverShadowCapture(runId: string) {
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
        captureId: runId, source: { kind: "text", text: shadowCaptureText }, fixtureId: "deterministic-local-v1" }) });
  } catch {
    // A lost reply does not mean capture failed. Keep the saved selection's
    // identity so a reload/retry recovers the committed job rather than replacing it.
    throw new Error(unconfirmed);
  }
  if (!captured.ok) throw new Error(unconfirmed);
  const capture = captureWorkspaceResponseV1.parse(await captured.json());
  if (capture.captureId !== runId) throw new Error("The saved capture does not match this selection.");
  return capture.jobId;
}
export async function readShadowResults(jobId: string) {
  const response = await fetch(`/api/jobs/${jobId}/shadow-demo`, { cache: "no-store" });
  if (!response.ok) throw new Error("Saved journey results are unavailable to this practice session.");
  return parseShadowReport(await response.json(), jobId);
}
