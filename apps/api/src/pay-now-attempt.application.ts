import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { MAX_MONEY_PENCE, money, parsePayNowInvoice, payNowOptions } from "@jobguard/core";
import { PayNowAttemptError, PayNowAttemptRepository, PracticeInvoiceRepository, withTenant } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";

import { CustomerRefused, customerToken } from "./auth/customer-signin.js";
import type { IdentityHttpRequest } from "./auth/identity-http.js";

const commandV1 = z.object({ commandId: z.guid(), rail: z.enum(["bank_transfer", "card", "pay_by_bank"]) }).strict();
const locatorV1 = z.object({ jobId: z.guid(), invoiceId: z.guid() }).strict();
export function assertPayNowPreviewMode() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PayNowAttemptError("NOT_FOUND");
}
/** Synthetic views; only the builder command stores a practice attempt. */
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
    if (!principal) throw new PayNowAttemptError("UNAUTHENTICATED");
    const membership = await this.identity.provider.findMembership(principal, context.tenantId);
    if (!membership || !["owner", "admin"].includes(membership.role)) throw new PayNowAttemptError("FORBIDDEN");
    const invoice = (await new PracticeInvoiceRepository(this.pool).list(context, jobId)).find(row => row.id === invoiceId.toLowerCase());
    if (!invoice) throw new PayNowAttemptError("NOT_FOUND");
    let options: ReturnType<typeof payNowOptions> = [];
    if (invoice.balancePence > 0) {
      const source = await withTenant(this.pool, context, async db => (await db.$client.query(
        "SELECT app.pay_now_fake_attempt($1,$2,$3,'prepare',$4::jsonb) result",
        [context.tenantId, digest, jobId, JSON.stringify({ version: "pay-now-attempt.v1", commandId: randomUUID(), invoiceId, rail: "bank_transfer" })],
      )).rows[0]?.result as { invoice: unknown }).catch(error => { throw PayNowAttemptError.fromDatabase(error); });
      const current = parsePayNowInvoice(source.invoice);
      if (current.tenantId !== context.tenantId || current.jobId !== jobId.toLowerCase() || current.invoiceId !== invoiceId.toLowerCase()) throw new PayNowAttemptError("UNAVAILABLE");
      options = payNowOptions(current);
    }
    const history = await new PayNowAttemptRepository(this.pool).read(context, jobId, invoiceId);
    return { version: "pay-now-preview.v1" as const, synthetic: true as const,
      balancePence: options[0]?.customerTotal.pence ?? 0, options, attempts: history.attempts };
  }
  /** Display only. Scope comes exclusively from the authenticated customer cookie. */
  async customerPractice(request: IdentityHttpRequest) {
    assertPayNowPreviewMode();
    if (request.headers["x-tenant-id"]) throw new CustomerRefused();
    const token = customerToken(request);
    const credential = z.tuple([z.guid(), z.guid(), z.guid(), z.string().regex(/^[A-Za-z0-9_-]{43}$/u)]).safeParse(token?.split("."));
    if (!credential.success) throw new CustomerRefused();
    const [tenantId, jobId, customerId] = credential.data;
    let raw: unknown;
    try {
      raw = (await this.identity.provider.repository.pool.query(
        "SELECT identity.customer_practice_pay_now($1,$2,$3,$4) result",
        [tenantId, jobId, customerId, this.identity.provider.digest(`customer-session:${token}`)],
      )).rows[0]?.result;
    } catch (error) {
      if ((error as { code?: string }).code === "42501") throw new CustomerRefused();
      throw error;
    }
    const source = z.object({ invoiceNumber: z.string().min(1).max(100), balancePence: z.number().int().min(0).max(MAX_MONEY_PENCE) }).strict().parse(raw);
    // Identity-only fields are local placeholders for core's tariff projection;
    // no invoice locator, catch provenance or stored attempt is read or exposed.
    const options = source.balancePence === 0 ? [] : payNowOptions({
      version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo",
      tenantId, jobId, invoiceId: jobId, revision: 1, kind: "final", includesCatch: false,
      builderAccount: `fake-builder-${tenantId}`, balancePence: source.balancePence, currency: "GBP",
    }).map(({ rail, customerTotal }) => ({ rail, customerTotal }));
    return { invoiceNumber: source.invoiceNumber, amountDue: money(source.balancePence), options };
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
    : error.code === "FORBIDDEN" ? 403 : error.code === "UNAUTHENTICATED" ? 401
    : error.code === "REPLAY_CONFLICT" || error.code === "ALREADY_ATTEMPTED" ? 409 : 503, body: { version: "pay-now-preview-error.v1", code: error.code } };
  const auth = identityStatus(error);
  return { status: auth.status, body: { version: "pay-now-preview-error.v1", code: auth.code } };
}
