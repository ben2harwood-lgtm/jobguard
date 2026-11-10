import { isRequestBindingRefusal, RequestBindingRefusedError } from "./request-binding-error.js";
import { isDeepStrictEqual } from "node:util";
import type { Pool } from "pg";
import { z } from "zod";
import { parsePayNowInvoice, payNowFakeResult, payNowOptions } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const id = z.guid().transform(value => value.toLowerCase());
const inputV1 = z.object({ version: z.literal("pay-now-attempt.v1"), commandId: id,
  invoiceId: id, rail: z.enum(["bank_transfer", "card", "pay_by_bank"]) }).strict();
const actorV1 = z.object({ jobId: id, sessionDigest: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const sourceV1 = z.object({ invoice: z.unknown(), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const storedV1 = z.object({ synthetic: z.literal(true), commandId: id, actorId: id,
  rail: z.enum(["bank_transfer", "card", "pay_by_bank"]), invoice: z.unknown(),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/u), result: z.unknown(), options: z.unknown() }).strict();
export class PayNowAttemptError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "REPLAY_CONFLICT" | "ALREADY_ATTEMPTED" | "UNAVAILABLE" | "FORBIDDEN" | "UNAUTHENTICATED") {
    super(code); this.name = "PayNowAttemptError";
  }
  /** Share SQL refusal classification with the application's read-only prepare. */
  static fromDatabase(error: unknown): PayNowAttemptError {
    if (error instanceof PayNowAttemptError) return error;
    if (error instanceof RequestBindingRefusedError) return new PayNowAttemptError("UNAUTHENTICATED");
    if (isRequestBindingRefusal(error)) return new PayNowAttemptError("FORBIDDEN");
    const message = error instanceof Error ? error.message : "";
    if (message === "METER_FORBIDDEN") return new PayNowAttemptError("FORBIDDEN");
    if (message === "PAY_NOW_UNAUTHENTICATED") return new PayNowAttemptError("UNAUTHENTICATED");
    for (const code of ["NOT_FOUND", "REPLAY_CONFLICT", "ALREADY_ATTEMPTED"] as const) {
      if (message === code) return new PayNowAttemptError(code);
    }
    return new PayNowAttemptError("UNAVAILABLE");
  }
}
function checked(raw: unknown, tenantId: string, jobId: string, invoiceId: string) {
  const row = storedV1.parse(raw), invoice = parsePayNowInvoice(row.invoice);
  if (invoice.tenantId !== tenantId || invoice.jobId !== jobId || invoice.invoiceId !== invoiceId
    || invoice.kind !== "final" || !isDeepStrictEqual(row.result, payNowFakeResult(invoice, row.rail))
    || !isDeepStrictEqual(row.options, payNowOptions(invoice))) throw new PayNowAttemptError("UNAVAILABLE");
  return { ...row, invoice, result: payNowFakeResult(invoice, row.rail), options: payNowOptions(invoice) };
}
/** Dark synthetic observations only. No invoice/receipt/ledger mutations or live composition. */
export class PayNowAttemptRepository {
  constructor(private readonly pool: Pool) {}
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      throw PayNowAttemptError.fromDatabase(error);
    }
  }
  async command(context: VerifiedTenantContext, actor: unknown, raw: unknown) {
    const input = inputV1.safeParse(raw), who = actorV1.safeParse(actor);
    if (!input.success || !who.success) throw new PayNowAttemptError("INVALID_INPUT");
    const { jobId, sessionDigest } = who.data, v = input.data;
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const call = async (operation: string, data: unknown): Promise<unknown> =>
        (await db.$client.query("SELECT app.pay_now_fake_attempt($1,$2,$3,$4,$5::jsonb) result",
          [context.tenantId, sessionDigest, jobId, operation, JSON.stringify(data)])).rows[0]?.result;
      const source = sourceV1.parse(await call("prepare", v));
      const invoice = parsePayNowInvoice(source.invoice);
      if (invoice.kind !== "final" || invoice.tenantId !== context.tenantId || invoice.jobId !== jobId
        || invoice.invoiceId !== v.invoiceId) throw new PayNowAttemptError("UNAVAILABLE");
      const row = await call("store", { ...v, snapshotHash: source.snapshotHash,
        result: payNowFakeResult(invoice, v.rail), options: payNowOptions(invoice) });
      return checked(row, context.tenantId, jobId, v.invoiceId);
    }));
  }
  async read(context: VerifiedTenantContext, jobId: string, invoiceId: string) {
    if (!id.safeParse(jobId).success || !id.safeParse(invoiceId).success) throw new PayNowAttemptError("INVALID_INPUT");
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const result: unknown = (await db.$client.query("SELECT app.pay_now_fake_attempt($1,NULL,$2,'read',$3::jsonb) result",
        [context.tenantId, jobId.toLowerCase(), JSON.stringify({ invoiceId: invoiceId.toLowerCase() })])).rows[0]?.result;
      if (!Array.isArray(result)) throw new PayNowAttemptError("UNAVAILABLE");
      return { synthetic: true as const, attempts: result.map(row => checked(row, context.tenantId, jobId.toLowerCase(), invoiceId.toLowerCase())) };
    }));
  }
}
