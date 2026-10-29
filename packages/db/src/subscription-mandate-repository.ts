import { z } from "zod";
import type { Pool } from "pg";
import { checkSyntheticSubscriptionAgreement, subscriptionAgreementSelectionV1, subscriptionAgreementText,
  subscriptionAgreementHash, subscriptionAgreementRecordV1, MAX_MONEY_PENCE } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const sequence = z.number().int().safe().nonnegative();
const common = { version: z.literal("subscription-mandate-command.v1"), expectedSequence: sequence };
export const subscriptionMandateCommandV1 = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("approve"), selection: subscriptionAgreementSelectionV1 }).strict(),
  z.object({ ...common, kind: z.enum(["revoked", "cancelled", "paused", "renewal_failed", "superseded"]) }).strict(),
]);
const pence = z.number().int().safe().min(0).max(MAX_MONEY_PENCE);
/** Internal collection preflight only; callers must supply current server period totals.
 * It neither reserves money nor authorises an executor. Statement execution needs M4-12's locked read. */
export const subscriptionMandateCollectionV1 = z.object({
  version: z.literal("subscription-mandate-collection.v1"), environment: z.enum(["synthetic_demo", "production"]),
  action: z.enum(["renewal", "extra_places", "statement", "notice"]),
  recipientRef: uuid, currentRevision: sequence, currentTermsHash: hash,
  billingMode: z.enum(["paid", "first_job_trial", "pilot_no_charge"]), providerDefaultsDisabled: z.boolean(),
  amountPence: pence, reservedAndCollectedPeriodPence: pence,
}).strict();
const resultSchema = z.object({ version: z.literal("subscription-mandate-result.v1"), sequence,
  state: subscriptionAgreementRecordV1.shape.state, productionEnabled: z.literal(false) }).strict();
const snapshotSchema = z.union([
  z.object({ record: z.null(), reason: z.literal("NOT_APPROVED") }).strict(),
  z.object({ now: z.string(), sequence, providerCancellation: z.enum(["pending", "not_requested"]),
    authorityCurrent: z.boolean(), record: subscriptionAgreementRecordV1 }).strict(),
]);
const codes = ["MANDATE_INVALID", "MANDATE_FORBIDDEN", "MANDATE_COMMAND_CONFLICT", "MANDATE_STALE",
  "MANDATE_NOTICE_REAUTHORISATION_REQUIRED", "MANDATE_NOT_APPROVED", "MANDATE_TERMINAL", "MANDATE_UNAVAILABLE"] as const;
export class SubscriptionMandateError extends Error {
  constructor(readonly code: (typeof codes)[number]) { super(code); this.name = "SubscriptionMandateError"; }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new SubscriptionMandateError("MANDATE_INVALID");
  return parsed.data;
}
export class SubscriptionMandateRepository {
  constructor(private readonly pool: Pool) {}
  async command(context: VerifiedTenantContext, digest: string, commandId: string, raw: unknown) {
    parse(uuid, commandId); parse(hash, digest);
    const input = parse(subscriptionMandateCommandV1, raw);
    let value: unknown = input;
    if (input.kind === "approve") {
      if (input.selection.tenantId !== context.tenantId) throw new SubscriptionMandateError("MANDATE_FORBIDDEN");
      const { selection, ...command } = input;
      value = { ...command, termsText: subscriptionAgreementText(selection), termsHash: subscriptionAgreementHash(selection) };
    }
    return this.run(context, async db => resultSchema.parse((await db.query(
      "SELECT app.m413_command($1,$2,$3,$4::jsonb) result", [context.tenantId, digest, commandId, JSON.stringify(value)],
    )).rows[0]?.result));
  }
  async read(context: VerifiedTenantContext, digest: string) {
    parse(hash, digest);
    return this.run(context, async db => snapshotSchema.parse((await db.query(
      "SELECT app.m413_read($1,$2) result", [context.tenantId, digest],
    )).rows[0]?.result));
  }
  async mayInitiate(context: VerifiedTenantContext, digest: string, raw: unknown) {
    const request = parse(subscriptionMandateCollectionV1, raw);
    const refuse = (reason: string, eligibleForSimulation = false) => ({
      version: "subscription-mandate-initiation.v1" as const, mayInitiate: false as const,
      productionEnabled: false as const, eligibleForSimulation, reason,
    });
    if (request.environment !== "synthetic_demo") return refuse("AGREEMENT_DARK");
    const snapshot = await this.read(context, digest);
    if (!snapshot.record) return refuse("NOT_APPROVED");
    const { record } = snapshot;
    if (record.state !== "active") return refuse(record.state.toUpperCase());
    if (!snapshot.authorityCurrent) return refuse("APPROVAL_NO_LONGER_VALID");
    if (request.currentRevision !== record.selection.revision || request.currentTermsHash !== record.termsHash)
      return refuse("SUPERSEDED_TERMS");
    if (request.recipientRef !== record.selection.recipientRef) return refuse("RECIPIENT_OUTSIDE_AUTHORITY");
    if (Date.parse(snapshot.now) < Date.parse(record.selection.validFrom)) return refuse("NOT_YET_VALID");
    if (Date.parse(snapshot.now) >= Date.parse(record.selection.expiresAt)) return refuse("EXPIRED");
    if (request.billingMode === "pilot_no_charge") return refuse("PILOT_EXEMPT");
    if (!request.providerDefaultsDisabled) return refuse("PROVIDER_DEFAULTS_UNAPPROVED");
    if (request.action === "statement") return refuse("STATEMENT_REQUIRES_EXACT_LOCKED_APPROVAL");
    try {
      checkSyntheticSubscriptionAgreement({ version: "subscription-agreement-check.v1", environment: "synthetic_demo",
        tenantId: context.tenantId, now: snapshot.now, currentRevision: request.currentRevision,
        currentTermsHash: request.currentTermsHash, currentMembershipVerified: true, providerDefaultsDisabled: true,
        record, action: request.action, billingMode: request.billingMode, amountPence: request.amountPence,
        reservedAndCollectedPeriodPence: request.reservedAndCollectedPeriodPence });
    } catch { return refuse("OUTSIDE_BOUNDED_AUTHORITY"); }
    return refuse("AGREEMENT_DARK", true);
  }
  private async run<T>(context: VerifiedTenantContext, work: (db: import("pg").PoolClient) => Promise<T>): Promise<T> {
    try { return await withTenant(this.pool, context, db => work(db.$client)); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "METER_FORBIDDEN") throw new SubscriptionMandateError("MANDATE_FORBIDDEN");
      const known = codes.find(code => code === message);
      throw new SubscriptionMandateError(known ?? "MANDATE_UNAVAILABLE");
    }
  }
}
