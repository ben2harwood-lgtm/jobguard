import "server-only";
import { cookies } from "next/headers";
import { authenticatePracticeSession, persistedBillabilityCommandV1, RecoveryBillabilityRepository } from "@jobguard/db";
import { z } from "zod";
import { resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";

const uuid = z.string().uuid().refine(value => value === value.toLowerCase());
const missing = () => new Error("BILLABILITY_NOT_FOUND");
export function billabilityFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "INVALID_BILLABILITY_INPUT") return { status: 400, code, message: "The request must contain only the review or approval fields, with a whole-pence amount and reasons." };
  if (code === "BILLABILITY_STALE" || code === "BILLABILITY_REPLAY_CONFLICT") return { status: 409, code, message: "The case or request has changed. Reload and check the stored review before sending a new request." };
  if (code === "BILLABILITY_NOT_APPROVABLE" || code === "BILLABILITY_SOURCE_REQUIRED") return { status: 422, code: "BILLABILITY_NOT_APPROVABLE", message: "This recovery cannot be approved. Settled, allocated, verified recovery evidence and an eligible post-lock catch are required." };
  if (["BILLABILITY_NOT_FOUND", "BILLABILITY_FORBIDDEN", "UNAUTHENTICATED", "TENANT_FORBIDDEN", "FINAL_CHECK_FORBIDDEN"].includes(code)) return { status: 404, code: "BILLABILITY_NOT_FOUND", message: "This review is unavailable for this session." };
  return { status: 503, code: "BILLABILITY_UNAVAILABLE", message: "The server could not confirm the result. Retry the same request." };
}

/** Session-only adapter. No request tenant, actor, status, lock or fee authority. */
export async function recoveryBillabilityRequest(request: Request, jobId: string, caseId: string): Promise<unknown> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo" || !uuid.safeParse(jobId).success || !uuid.safeParse(caseId).success) throw missing();
  if (request.method === "POST" && (!process.env.AUTH_ALLOWED_ORIGIN || request.headers.get("origin") !== process.env.AUTH_ALLOWED_ORIGIN)) throw missing();
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
    const context = await resolveVerifiedTenantContext(identity.provider, { sessionToken: identityToken, requestedTenantId: session.memberships[0].tenantId, csrfToken: session.csrfToken, origin: identity.allowedOrigin }, identity.allowedOrigin);
    const digest = identity.provider.digest(`session:${identityToken}`);
    const view = await repository.read(context, jobId, caseId, digest);
    return input ? repository.command(context, jobId, digest, input) : view;
  }
  const auth = await authenticatePracticeSession(syntheticPool(), jar.get("jg_session")?.value);
  const view = await repository.read(auth.context, jobId, caseId, auth.digest);
  return input ? repository.command(auth.context, jobId, auth.digest, input) : view;
}
