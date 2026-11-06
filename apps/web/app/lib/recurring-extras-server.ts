import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { RecurringExtrasRepository } from "@jobguard/db";
import { z } from "zod";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";

export const recurringExtrasHeaders = { "Cache-Control": "no-store" };
export function recurringExtrasRequest(request: Request) {
  if (new URL(request.url).search || request.headers.has("x-tenant-id") || request.headers.has("x-actor-id") || request.headers.has("x-session-id") || request.headers.has("x-cutoff")) throw new Error("INVALID_INPUT");
}
export async function readRecurringExtras(rawJobId: unknown) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_ONLY");
  const jobId = z.guid().parse(rawJobId);
  const token = (await cookies()).get("jobguard_session")?.value;
  const identity = identityApplication(), session = await identity.session(token);
  if (session.memberships.length !== 1 || session.memberships[0]!.role !== "owner") throw new Error("FORBIDDEN");
  const member = session.memberships[0]!;
  const context = await resolveVerifiedTenantContext(identity.provider, { sessionToken: token, requestedTenantId: member.tenantId,
    origin: identity.allowedOrigin, csrfToken: session.csrfToken }, identity.allowedOrigin);
  return new RecurringExtrasRepository(syntheticPool()).read(context, member.id, jobId);
}
export function recurringExtrasFailure(error: unknown) {
  const e = error as { message?: string; code?: string; name?: string };
  const code = e.code ?? e.message;
  const status = e.name === "ZodError" || code === "INVALID_INPUT" ? 400 : code === "UNAUTHENTICATED" ? 401
    : code === "SYNTHETIC_ONLY" || code === "FORBIDDEN" || code === "42501" || code === "TENANT_FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 503;
  return NextResponse.json({ version: "recurring-extras-error.v1", reason: status === 503 ? "Practice suggestions are unavailable." : "Practice read refused." }, { status, headers: recurringExtrasHeaders });
}
