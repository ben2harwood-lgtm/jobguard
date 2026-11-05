import "server-only";
import { ZodError } from "zod";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AuthError, resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { SubscriptionMandateError, SubscriptionMandateRepository } from "@jobguard/db";
import { subscriptionAgreementHash, subscriptionAgreementSelectionV1, subscriptionAgreementText } from "@jobguard/core";
import { identityApplication, identityCredentials } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
import { isTrustedBrowserOrigin } from "../api/contractor/origin";
import type { BrowserMandateCommand } from "../api/subscription-mandate/route";

const headers = { "Cache-Control": "no-store" };
const notFound = () => NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers });

/** Company identity sessions only. No practice-cookie fallback or caller-selected tenant. */
export async function subscriptionMandateRequest(request: Request, input?: BrowserMandateCommand) {
  try {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") return notFound();
    if (request.headers.has("x-tenant-id")) return notFound();
    if (request.method === "POST" && !isTrustedBrowserOrigin(request)) return notFound();
    const identity = identityApplication();
    const credentials = await identityCredentials(request);
    const session = await identity.session(credentials.sessionToken);
    // Ambiguous companies fail closed rather than selecting a company from the browser.
    if (session.memberships.length !== 1 || session.memberships[0]?.role !== "owner") return notFound();
    const membership = session.memberships[0];
    const context = await resolveVerifiedTenantContext(identity.provider, {
      sessionToken: credentials.sessionToken, requestedTenantId: membership.tenantId,
      origin: request.method === "GET" ? identity.allowedOrigin : credentials.origin,
      csrfToken: request.method === "GET" ? session.csrfToken : credentials.csrfToken,
    }, identity.allowedOrigin);
    const digest = identity.provider.digest(`session:${credentials.sessionToken}`);
    const repository = new SubscriptionMandateRepository(syntheticPool());
    const proof = (selection: unknown, sequence: number) => identity.provider.digest(
      `subscription-mandate-preview.v1:${digest}:${sequence}:${subscriptionAgreementText(selection)}`,
    );
    if (input) {
      const { commandId, command } = input;
      if (command.kind === "approve") {
        const parsed = subscriptionAgreementSelectionV1.safeParse({ ...command.selection, tenantId: context.tenantId });
        if (!parsed.success) throw new SubscriptionMandateError("MANDATE_INVALID");
        const selection = parsed.data;
        const expected = proof(selection, command.expectedSequence);
        if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(command.previewProof, "hex")))
          throw new SubscriptionMandateError("MANDATE_INVALID");
        const result = await repository.command(context, digest, commandId, {
          version: command.version, kind: command.kind, expectedSequence: command.expectedSequence, selection,
        });
        return NextResponse.json({ ...result, termsHash: subscriptionAgreementHash(selection) }, { headers });
      }
      return NextResponse.json(await repository.command(context, digest, commandId, command), { headers });
    }
    const url = new URL(request.url);
    const plan = url.searchParams.get("plan") ?? "Solo";
    if ([...url.searchParams.keys()].some(key => key !== "plan") || !["Solo", "Builder"].includes(plan))
      throw new SubscriptionMandateError("MANDATE_INVALID");
    const snapshot = await repository.read(context, digest);
    const sequence = "sequence" in snapshot ? snapshot.sequence : 0;
    // A bounded practice specimen, not a proposed production validity/notice policy.
    const selection = snapshot.record?.selection.plan === plan ? snapshot.record.selection : subscriptionAgreementSelectionV1.parse({
      version: "subscription-agreement-selection.v1", termsVersion: "synthetic_subscription_success_terms.v1",
      catalogueVersion: "subscription_pricing_policy_v4", tenantId: context.tenantId, agreementId: randomUUID(),
      revision: 1, plan, cadence: "monthly", anchorDay: 1, recipientRef: session.principal.id,
      validFrom: new Date(Date.now() + 3_600_000).toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const { tenantId: _tenantId, ...browserSelection } = selection;
    return NextResponse.json({ version: "subscription-mandate-screen.v1", snapshot: {
      ...snapshot, authorityCurrent: !!snapshot.record && snapshot.record.state === "active"
        && "authorityCurrent" in snapshot && snapshot.authorityCurrent,
    }, sequence, csrfToken: session.csrfToken, preview: {
      selection: browserSelection, termsText: subscriptionAgreementText(selection),
      termsHash: subscriptionAgreementHash(selection), previewProof: proof(selection, sequence),
    } }, { headers });
  } catch (error) {
    if (error instanceof ZodError || error instanceof AuthError || (error instanceof SubscriptionMandateError && error.code === "MANDATE_FORBIDDEN")) return notFound();
    const code = error instanceof SubscriptionMandateError ? error.code : "MANDATE_UNAVAILABLE";
    const status = code === "MANDATE_INVALID" ? 400 : code === "MANDATE_UNAVAILABLE" ? 503 : 409;
    return NextResponse.json({ version: "subscription-mandate-error.v1", code }, { status, headers });
  }
}
