import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { authenticatePracticeSession, persistedBillabilityCommandV1, RecoveryBillabilityRepository } from "@jobguard/db";
import { z } from "zod";
import { resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

const uuid = z.string().uuid().refine(value => value === value.toLowerCase());
const missing = () => new Error("BILLABILITY_NOT_FOUND");
export function billabilityFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "ORIGIN_FORBIDDEN") return { status: 403, code, message: "This request is not authorised for this session." };
  if (code === "INVALID_BILLABILITY_INPUT") return { status: 400, code, message: "The request must contain only the review or approval fields, with a whole-pence amount and reasons." };
  if (code === "BILLABILITY_LINE_ALREADY_APPROVED") return { status: 409, code, message: "This line is already approved. Reload to see the stored approval." };
  if (code === "BILLABILITY_STALE" || code === "BILLABILITY_REPLAY_CONFLICT") return { status: 409, code, message: "The case or request has changed. Reload and check the stored review before sending a new request." };
  if (code === "BILLABILITY_NOT_APPROVABLE" || code === "BILLABILITY_SOURCE_REQUIRED") return { status: 422, code: "BILLABILITY_NOT_APPROVABLE", message: "This recovery cannot be approved. Settled, allocated, verified recovery evidence and an eligible post-lock catch are required." };
  if (["BILLABILITY_NOT_FOUND", "BILLABILITY_FORBIDDEN", "UNAUTHENTICATED", "TENANT_FORBIDDEN", "FINAL_CHECK_FORBIDDEN"].includes(code)) return { status: 404, code: "BILLABILITY_NOT_FOUND", message: "This review is unavailable for this session." };
  return { status: 503, code: "BILLABILITY_UNAVAILABLE", message: "The server could not confirm the result. Retry the same request." };
}

/** Session-only adapter. No request tenant, actor, status, lock or fee authority. */
export async function recoveryBillabilityRequest(request: Request, jobId: string, caseId: string): Promise<unknown> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo" || !uuid.safeParse(jobId).success || !uuid.safeParse(caseId).success) throw missing();
  if (request.method === "POST" && !isTrustedBrowserOrigin(request)) throw missing();
  const jar = await cookies();
  const repository = new RecoveryBillabilityRepository(syntheticPool());
  let input: ReturnType<typeof persistedBillabilityCommandV1.parse> | undefined;
  if (request.method === "POST") {
    const parsed = persistedBillabilityCommandV1.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.caseId !== caseId) throw new Error("INVALID_BILLABILITY_INPUT");
    input = parsed.data;
  }
  const identityToken = jar.get("jobguard_session")?.value;
  // Approval must use a real, separate synthetic owner identity session. No fallback.
  if (input?.action === "approve" || (!input && identityToken)) {
    const identity = identityApplication();
    const session = await identity.session(identityToken);
    if (session.memberships.length !== 1 || session.memberships[0]?.role !== "owner") throw missing();
    const context = await resolveVerifiedTenantContext(identity.provider, { sessionToken: identityToken, requestedTenantId: session.memberships[0].tenantId, csrfToken: input ? request.headers.get("x-csrf-token") ?? undefined : session.csrfToken, origin: input ? request.headers.get("origin") ?? undefined : identity.allowedOrigin }, identity.allowedOrigin);
    const digest = identity.provider.digest(`session:${identityToken}`);
    const view = await repository.read(context, jobId, caseId, digest);
    return input ? browserResult(await repository.command(context, jobId, digest, input)) : browserView(view, session.csrfToken);
  }
  const auth = await authenticatePracticeSession(syntheticPool(), jar.get("jg_session")?.value);
  const csrfToken = createHash("sha256").update(`billability-csrf.v1:${auth.digest}`).digest("hex");
  if (input) {
    const supplied = request.headers.get("x-csrf-token") ?? "";
    if (!/^[a-f0-9]{64}$/u.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(csrfToken))) throw new Error("ORIGIN_FORBIDDEN");
  }
  const view = await repository.read(auth.context, jobId, caseId, auth.digest);
  return input ? browserResult(await repository.command(auth.context, jobId, auth.digest, input)) : browserView(view, csrfToken);
}

// Browser fields are selected here; immutable authority and source snapshots stay server-side.
type StoredView = Awaited<ReturnType<RecoveryBillabilityRepository["read"]>>;
type StoredResult = Awaited<ReturnType<RecoveryBillabilityRepository["command"]>>;
function browserResult(result: StoredResult) {
  const { version, productionEnabled, command } = result;
  if (result.version === "recovery-billability-approval.v1")
    return { version, productionEnabled, command: { commandId: command.commandId } };
  return { version, productionEnabled,
    command: { commandId: result.command.commandId, claimedEligiblePrincipalPence: result.command.claimedEligiblePrincipalPence, reasons: result.command.reasons },
    snapshot: { caseType: result.snapshot.caseType, builderCaptured: result.snapshot.builderCaptured, disclosedBeforeLock: result.snapshot.disclosedBeforeLock },
    assessment: { classification: result.assessment.classification, exclusions: result.assessment.exclusions } };
}
function browserView(view: StoredView, csrfToken: string) {
  return { version: view.version, caseId: view.caseId, caseRevision: view.caseRevision, csrfToken,
    lines: view.lines.map(({workId,lineId}) => ({workId,lineId})),
    reviews: view.reviews.map(({workId,lineId,review,approved}) => ({workId,lineId,review:browserResult(review),approved})) };
}
