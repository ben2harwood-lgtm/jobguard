import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { managedRecoveryCommandV1, MANAGED_RECOVERY_TERMS } from "@jobguard/core";
import { resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { ManagedRecoveryRepository } from "@jobguard/db";
import { identityApplication, identityCredentials } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";
import { pounds } from "./pounds";

const headers = { "Cache-Control": "no-store" };
const ids = z.object({ id: z.guid(), caseId: z.guid() });
const notFound = () => Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });

/** The session selects the sole membership. No tenant/actor/amount headers or body authority. */
export async function managedRecoveryRequest(request: Request, params: { id: string; caseId: string }, mutation = false) {
  try {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw notFound();
    if (mutation && !isTrustedBrowserOrigin(request))
      return NextResponse.json({ code: "ORIGIN_FORBIDDEN", message: "This request must come from the practice site." }, { status: 403, headers });
    if (!ids.safeParse(params).success) throw notFound();
    const identity = identityApplication();
    const credentials = await identityCredentials(request);
    const session = await identity.session(credentials.sessionToken);
    // Fail closed for ambiguous company sessions rather than taking a client tenant selector.
    const member = session.memberships.length === 1 ? session.memberships[0] : undefined;
    if (!member || member.role !== "owner") throw notFound();
    const context = await resolveVerifiedTenantContext(identity.provider, {
      sessionToken: credentials.sessionToken, requestedTenantId: member.tenantId,
      csrfToken: mutation ? credentials.csrfToken : session.csrfToken, origin: mutation ? credentials.origin : identity.allowedOrigin,
    }, identity.allowedOrigin);
    const actor = { membershipId: member.id, identityUserId: session.principal.id };
    const repository = new ManagedRecoveryRepository(syntheticPool(), identity.provider.digest(`session:${credentials.sessionToken}`));
    if (mutation) {
      const raw: unknown = await request.json().catch(() => null);
      const parsed = managedRecoveryCommandV1.safeParse(raw);
      if (!parsed.success || parsed.data.caseId !== params.caseId.toLowerCase())
        return NextResponse.json({ code: "INVALID_MANAGED_RECOVERY", message: "Check the case, choice and terms, then try again." }, { status: 400, headers });
      await repository.elect(context, params.id, parsed.data, actor);
    }
    const preview = await repository.preview(context, params.id, params.caseId, actor);
    // Read the two existing literal selections; this boundary adds no service table or pricing rule.
    const choices = managedRecoveryCommandV1.shape.selection.options.map(option => {
      const selection = option.parse({ service: option.shape.service.value, points: option.shape.points.value });
      return {
        label: `+${selection.points} points: ${selection.service === "drafted_for_you" ? "drafted for you" : "a solicitor letter"}`,
        command: { version: "managed-recovery-election-command.v1" as const, caseId: preview.caseId,
          termsVersion: MANAGED_RECOVERY_TERMS, selection },
      };
    });
    return NextResponse.json({ version: "managed-recovery-screen.v1", csrfToken: session.csrfToken, preview, choices,
      termsVersion: MANAGED_RECOVERY_TERMS, successFeeLabel: "Unchanged 10% success fee",
      successFeeAmount: pounds(preview.successFee.cumulativeFee.pence),
      serviceChargeAmount: preview.serviceChargeInvoice ? pounds(preview.serviceChargeInvoice.principal.pence) : null,
      message: mutation ? "Your practice choice is saved for this case. Nothing has been issued or charged." : "Choose only if you want to practise an optional service." }, { headers });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const status = code === "ORIGIN_FORBIDDEN" ? 403 : code === "MANAGED_RECOVERY_CONFLICT" || code === "PURSUIT_ALREADY_STARTED" ? 409
      : ["NOT_FOUND", "MANAGED_RECOVERY_FORBIDDEN", "UNAUTHENTICATED", "TENANT_FORBIDDEN", "42501"].includes(code ?? "") ? 404 : 503;
    const publicCode = status === 403 ? "ORIGIN_FORBIDDEN" : status === 404 ? "NOT_FOUND" : status === 503 ? "MANAGED_RECOVERY_UNAVAILABLE" : code;
    const message = publicCode === "PURSUIT_ALREADY_STARTED" ? "Pursuit has already started. You cannot choose a managed-recovery service for this case."
      : publicCode === "MANAGED_RECOVERY_CONFLICT" ? "A different choice is already recorded, or this command was changed. Refresh to see the saved choice."
      : status === 403 ? "This request must come from the practice site."
      : status === 404 ? "This practice case is not available."
      : "The result is uncertain. Retry the same choice to check it safely.";
    return NextResponse.json({ code: publicCode, message }, { status, headers });
  }
}
