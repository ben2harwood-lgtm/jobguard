import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { RateSuggestionApplication } from "@jobguard/api/workspace";
import { RateSuggestionRepository, storedRateQueryV1 } from "@jobguard/db";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

export const rateHeaders = { "Cache-Control": "no-store" };
export function rateQuery(params: URLSearchParams) {
  if (!params.size) return undefined;
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error("INVALID_ACCEPTANCE");
  return storedRateQueryV1.parse(Object.fromEntries(entries));
}
export async function rateSession(request?: Request) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_ONLY");
  const token = (await cookies()).get("jobguard_session")?.value;
  const identity = identityApplication();
  if (request) {
    const session = await identity.session(token);
    if (session.memberships.length !== 1 || session.memberships[0]?.role !== "owner") throw new Error("FORBIDDEN");
    // Match the mandate boundary: a mutation uses browser-supplied CSRF and origin.
    const context = await resolveVerifiedTenantContext(identity.provider, {
      sessionToken: token, requestedTenantId: session.memberships[0].tenantId,
      origin: request.headers.get("origin") ?? undefined,
      csrfToken: request.headers.get("x-csrf-token") ?? undefined,
    }, identity.allowedOrigin);
  }
  const application = new RateSuggestionApplication(identity, new RateSuggestionRepository(syntheticPool()));
  return { token, application };
}
export function rateOrigin(request: Request) {
  if (!isTrustedBrowserOrigin(request)) throw new Error("ORIGIN_FORBIDDEN");
}
export function refuseRateIdentity(request: Request) {
  for (const header of ["x-tenant-id", "x-actor-id", "x-session-id"]) {
    if (request.headers.has(header)) throw new Error("INVALID_ACCEPTANCE");
  }
}
export function rateFailure(error: unknown) {
  const e = error as { message?: string; code?: string; name?: string };
  const messages: Record<string, [number, string]> = {
    UNAUTHENTICATED: [401, "Sign in to view practice suggestions."],
    SYNTHETIC_ONLY: [403, "Rate suggestions are practice only."],
    FORBIDDEN: [403, "A current company owner membership is required."],
    ORIGIN_FORBIDDEN: [403, "Use the practice page to accept a suggestion."],
    NOT_FOUND: [404, "This practice job is unavailable."],
    STALE_REVISION: [409, "This revision is stale or already accepted. Reload the suggestions."],
    STALE_BASELINE: [409, "The sources changed. Reload the suggestions."],
    COMMAND_CONFLICT: [409, "This acceptance command already has different details."],
    INVALID_ACCEPTANCE: [400, "Check the suggestion and revision details."],
    UNKNOWN_RATE: [400, "There is not enough to say. No rate can be accepted."],
  };
  const code = e.code === "42501" ? "FORBIDDEN" : e.code === "P0002" ? "NOT_FOUND"
    : e.name === "ZodError" || error instanceof SyntaxError ? "INVALID_ACCEPTANCE" : e.message ?? "";
  const [status, reason] = messages[code] ?? [503, "The result is uncertain. Retry the same acceptance command."];
  return NextResponse.json({ version: "rate-error.v1", reason }, { status, headers: rateHeaders });
}
