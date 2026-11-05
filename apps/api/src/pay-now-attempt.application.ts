import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { parsePayNowInvoice, payNowOptions } from "@jobguard/core";
import { PayNowAttemptError, PayNowAttemptRepository, PracticeInvoiceRepository, withTenant } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";

const commandV1 = z.object({ commandId: z.guid(), rail: z.enum(["bank_transfer", "card", "pay_by_bank"]) }).strict();
const locatorV1 = z.object({ jobId: z.guid(), invoiceId: z.guid() }).strict();
export function assertPayNowPreviewMode() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PayNowAttemptError("NOT_FOUND");
}
/** Builder-only synthetic observations. Prepare is read-only; only command stores an attempt. */
export class PayNowAttemptApplication {
  constructor(private readonly identity: IdentityApplication, private readonly pool: Pool) {}
  async read(credentials: TenantRequestCredentials, jobId: string, invoiceId: string) {
    assertPayNowPreviewMode();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    if (!locatorV1.safeParse({ jobId, invoiceId }).success) throw new PayNowAttemptError("INVALID_INPUT");
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    // History alone is tenant-scoped. Apply the same owner/admin membership gate
    // through the existing identity provider; the private SQL actor helper has no runtime grant.
    const principal = await this.identity.provider.authenticate(credentials.sessionToken!);
    const membership = principal ? await this.identity.provider.findMembership(principal, context.tenantId) : undefined;
    if (!membership || !["owner", "admin"].includes(membership.role)) throw new PayNowAttemptError("UNAVAILABLE");
    const invoice = (await new PracticeInvoiceRepository(this.pool).list(context, jobId)).find(row => row.id === invoiceId.toLowerCase());
    if (!invoice) throw new PayNowAttemptError("NOT_FOUND");
    let options: ReturnType<typeof payNowOptions> = [];
    if (invoice.balancePence > 0) {
      const source = await withTenant(this.pool, context, async db => (await db.$client.query(
        "SELECT app.pay_now_fake_attempt($1,$2,$3,'prepare',$4::jsonb) result",
        [context.tenantId, digest, jobId, JSON.stringify({ version: "pay-now-attempt.v1", commandId: randomUUID(), invoiceId, rail: "bank_transfer" })],
      )).rows[0]?.result as { invoice: unknown });
      const current = parsePayNowInvoice(source.invoice);
      if (current.tenantId !== context.tenantId || current.jobId !== jobId.toLowerCase() || current.invoiceId !== invoiceId.toLowerCase()) throw new PayNowAttemptError("UNAVAILABLE");
      options = payNowOptions(current);
    }
    const history = await new PayNowAttemptRepository(this.pool).read(context, jobId, invoiceId);
    return { version: "pay-now-preview.v1" as const, synthetic: true as const,
      balancePence: options[0]?.customerTotal.pence ?? 0, options, attempts: history.attempts };
  }
  async command(credentials: TenantRequestCredentials, jobId: string, invoiceId: string, raw: unknown) {
    assertPayNowPreviewMode();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const parsed = commandV1.safeParse(raw);
    if (!parsed.success || !locatorV1.safeParse({ jobId, invoiceId }).success) throw new PayNowAttemptError("INVALID_INPUT");
    return new PayNowAttemptRepository(this.pool).command(context,
      { jobId, sessionDigest: this.identity.provider.digest(`session:${credentials.sessionToken}`) },
      { version: "pay-now-attempt.v1", invoiceId, ...parsed.data });
  }
}
export function payNowAttemptFailure(error: unknown) {
  if (error instanceof PayNowAttemptError) return { status: error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400
    : error.code === "REPLAY_CONFLICT" || error.code === "ALREADY_ATTEMPTED" ? 409 : 503, body: { version: "pay-now-preview-error.v1", code: error.code } };
  const auth = identityStatus(error);
  return { status: auth.status, body: { version: "pay-now-preview-error.v1", code: auth.code } };
}
