import { z } from "zod";
import type { Pool } from "pg";
import { directDebitMandateNext, directDebitPaymentNext, type DirectDebitMandateState, type DirectDebitPaymentState } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const id = z.uuid();
const labels = { environment: z.literal("synthetic_demo"), account: z.literal("fake_jobguard_dd") };
const locator = z.object({ version: z.literal("direct-debit-binding.v1"), ...labels, mandateId: id }).strict();
const paymentBinding = locator.extend({ commandId: id, objectId: z.string().regex(/^fake_dd_[a-f0-9]{64}$/u),
  amountPence: z.number().int().safe().min(1).max(1_000_000_000_000) }).strict();
const mandateEvent = z.object({ version: z.literal("fake-dd-mandate-event.v1"), ...labels,
  tenantId: id, mandateId: id, eventId: id,
  state: z.enum(["created", "pending_submission", "active", "cancelled", "failed", "expired"]) }).strict();
const paymentEvent = z.object({ version: z.literal("fake-dd-event.v1"), ...labels,
  tenantId: id, commandId: id, objectId: paymentBinding.shape.objectId, eventId: id,
  amountPence: paymentBinding.shape.amountPence, kind: z.literal("collection"),
  state: z.enum(["pending_submission", "submitted", "confirmed", "paid_out", "failed", "cancelled", "charged_back", "late_failure"]) }).strict();
const fact = z.object({ event: z.union([mandateEvent, paymentEvent]), binding: z.union([paymentBinding, locator]),
  hash: z.string().regex(/^[a-f0-9]{64}$/u), sequence: z.number().int().positive() }).strict();
const historySchema = z.array(fact);
export class DirectDebitFixtureError extends Error {
  constructor(readonly code: "DD_INVALID_INPUT" | "DD_NOT_FOUND" | "DD_CONFLICT" | "DD_DARK" | "DD_UNAVAILABLE") { super(code); }
}
/** Dark persistence seam. Only pass events already authenticated by the fake rail.
 * Bindings come from trusted server routing/accepted request facts, never the
 * webhook payload. This store neither verifies signatures nor creates authority.
 * Each call owns a transaction, so a rejected batch member writes nothing and
 * callers can continue processing subsequent members independently.
 */
export class DirectDebitFixtureRepository {
  constructor(private readonly pool: Pool) {}
  private async call(context: VerifiedTenantContext, operation: string, binding: unknown, event: unknown, expectedHead: string | null) {
    try {
      return await withTenant(this.pool, context, async db => {
        const result: unknown = (await db.$client.query("SELECT app.direct_debit_fixture($1,$2,$3::jsonb,$4::jsonb,$5::uuid) result",
          [context.tenantId, operation, JSON.stringify(binding), JSON.stringify(event), expectedHead])).rows[0]?.result;
        return historySchema.parse(result);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const codes = ["DD_INVALID_INPUT", "DD_NOT_FOUND", "DD_CONFLICT", "DD_DARK"] as const;
      throw new DirectDebitFixtureError(codes.find(code => code === message) ?? "DD_UNAVAILABLE");
    }
  }
  async recordMandate(context: VerifiedTenantContext, serverBinding: unknown, verifiedEvent: unknown, expectedHead: string | null) {
    const binding = locator.safeParse(serverBinding), event = mandateEvent.safeParse(verifiedEvent);
    if (!binding.success || !event.success || !z.uuid().nullable().safeParse(expectedHead).success) throw new DirectDebitFixtureError("DD_INVALID_INPUT");
    if (event.data.tenantId !== context.tenantId || event.data.mandateId !== binding.data.mandateId) throw new DirectDebitFixtureError("DD_NOT_FOUND");
    return this.call(context, "mandate", binding.data, event.data, expectedHead);
  }
  async recordPaymentEvent(context: VerifiedTenantContext, serverBinding: unknown, verifiedEvent: unknown, expectedHead: string | null) {
    const binding = paymentBinding.safeParse(serverBinding), event = paymentEvent.safeParse(verifiedEvent);
    if (!binding.success || !event.success || !z.uuid().nullable().safeParse(expectedHead).success) throw new DirectDebitFixtureError("DD_INVALID_INPUT");
    if (event.data.tenantId !== context.tenantId || event.data.commandId !== binding.data.commandId
      || event.data.objectId !== binding.data.objectId || event.data.amountPence !== binding.data.amountPence) throw new DirectDebitFixtureError("DD_NOT_FOUND");
    return this.call(context, "payment", binding.data, event.data, expectedHead);
  }
  async read(context: VerifiedTenantContext, raw: unknown) {
    const binding = locator.safeParse(raw);
    if (!binding.success) throw new DirectDebitFixtureError("DD_INVALID_INPUT");
    const history = await this.call(context, "read", binding.data, {}, null);
    let mandateState: DirectDebitMandateState = "created";
    const payments = new Map<string, { objectId: string; commandId: string; state: DirectDebitPaymentState; history: typeof history }>();
    for (const row of history) {
      if (row.event.tenantId !== context.tenantId || row.binding.mandateId !== binding.data.mandateId) throw new DirectDebitFixtureError("DD_UNAVAILABLE");
      if (row.event.version === "fake-dd-mandate-event.v1") mandateState = directDebitMandateNext(mandateState, row.event.state);
      else {
        const old = payments.get(row.event.objectId);
        payments.set(row.event.objectId, { objectId: row.event.objectId, commandId: row.event.commandId,
          state: directDebitPaymentNext(old?.state ?? null, row.event.state), history: [...(old?.history ?? []), row] });
      }
    }
    return { environment: "synthetic_demo" as const, account: "fake_jobguard_dd" as const,
      mandateId: binding.data.mandateId, mandateState, blocksNewSubmission: mandateState !== "active",
      head: history.at(-1)!.event.eventId, history, payments: [...payments.values()] };
  }
}
