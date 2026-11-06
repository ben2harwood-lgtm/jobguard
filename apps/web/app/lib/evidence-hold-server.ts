import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ContractorError } from "@jobguard/core";
import { ContractorRepository, contractorSessionContext, WormCommandRepository, WormCommandError, type VerifiedTenantContext, type WormReceipt } from "@jobguard/db";
import { syntheticPool } from "./synthetic-server";
import { identityApplication, identityCredentials } from "./identity-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";

const fields = { version: z.literal("evidence-hold.v1"), commandId: z.uuid(), idempotencyKey: z.uuid(), evidenceId: z.uuid() };
export const evidenceHoldInput = z.discriminatedUnion("action", [
  z.object({ ...fields, action: z.literal("apply_hold") }).strict(),
  z.object({ ...fields, action: z.literal("release_hold"), releaseOf: z.uuid() }).strict(),
]);
const messages: Record<WormReceipt["status"], Record<"apply_hold" | "release_hold", string>> = {
  queued: { apply_hold: "Hold requested", release_hold: "Release requested" },
  executing: { apply_hold: "Hold requested; confirmation pending", release_hold: "Release requested; confirmation pending" },
  pending: { apply_hold: "Hold requested; confirmation pending", release_hold: "Release requested; confirmation pending" },
  outcome_unknown: { apply_hold: "Hold outcome unknown", release_hold: "Release outcome unknown" },
  applied: { apply_hold: "Hold applied", release_hold: "Hold released" },
  refused: { apply_hold: "Hold refused", release_hold: "Release refused" },
  cancelled: { apply_hold: "Hold cancelled", release_hold: "Release cancelled" },
};
class HoldFailure extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}
const notFound = () => new HoldFailure("NOT_FOUND", 404, "Job or evidence not found.");
const headers = { "Cache-Control": "no-store" };

/** Session-only synthetic transport. No executor or storage credentials are configured here. */
export async function evidenceHoldResponse(request: Request, jobId: string, mutation: boolean) {
  try {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new HoldFailure("MODE_FORBIDDEN", 403, "Evidence holds are available only in synthetic practice.");
    if (mutation && !isTrustedBrowserOrigin(request)) throw new HoldFailure("ORIGIN_FORBIDDEN", 403, "Use this site's hold screen to make a request.");
    const sessionId = (await cookies()).get("jg_session")?.value;
    if (!sessionId || !z.uuid().safeParse(sessionId).success) throw new HoldFailure("UNAUTHENTICATED", 401, "Sign in to synthetic practice first.");
    const pool = syntheticPool();
    const member = await new ContractorRepository(pool).resolveSession(sessionId);
    const context: VerifiedTenantContext = await contractorSessionContext(pool, sessionId);
    if (!z.uuid().safeParse(jobId).success) throw notFound();
    let digest = "";
    if (mutation) {
      const credentials = await identityCredentials(request);
      if (!z.string().min(32).safeParse(credentials.sessionToken).success) throw new HoldFailure("UNAUTHENTICATED", 401, "Sign in to synthetic practice first.");
      digest = identityApplication().provider.digest(`session:${credentials.sessionToken}`);
    }
    const repository = new WormCommandRepository(pool, true, undefined, undefined, digest);
    const items = await repository.listHolds(context, member.membershipId, jobId);
    if (!items) throw notFound();
    if (!mutation) return NextResponse.json({ version: "evidence-holds.v1", items: items.map(item => ({
      ...item, message: item.action && item.status ? messages[item.status][item.action] : "No hold requested",
    })) }, { headers });
    const parsed = evidenceHoldInput.safeParse(await request.json());
    if (!parsed.success) throw new HoldFailure("INVALID_INPUT", 400, "The hold request is invalid.");
    const input = parsed.data;
    if (!items.some(item => item.evidenceId === input.evidenceId)) throw notFound();
    const receipt = await repository.submit(context, {
      ...input, version: "worm.command.v1", policyVersion: "synthetic_d07_v1",
      jobId, actorMembershipId: member.membershipId,
    });
    // No internal keys, versions, provider results, actor or tenant data leave this transport.
    const action = input.action;
    return NextResponse.json({ version: "evidence-hold-result.v1", commandId: receipt.id,
      status: receipt.status, message: messages[receipt.status][action] }, { status: 201, headers });
  } catch (error) {
    if (error instanceof HoldFailure) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status, headers });
    if (error instanceof SyntaxError) return NextResponse.json({ code: "INVALID_INPUT", message: "The hold request is invalid." }, { status: 400, headers });
    if (error instanceof ContractorError && error.code === "UNAUTHENTICATED") return NextResponse.json({ code: error.code, message: "Sign in to synthetic practice first." }, { status: 401, headers });
    if (error instanceof WormCommandError) {
      const conflict = error.code === "WORM_REPLAY_CONFLICT";
      return NextResponse.json({ code: error.code, message: conflict ? "This request key was already used for different content." : "Request refused. An active owner must request a hold; a different person must release an applied hold. An existing hold or release request must be resolved first." }, { status: conflict ? 409 : 403, headers });
    }
    return NextResponse.json({ code: "UNAVAILABLE", message: "The server could not confirm this request. Retry the same request." }, { status: 503, headers });
  }
}
