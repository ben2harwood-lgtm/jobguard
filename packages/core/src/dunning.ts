import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { MAX_MONEY_PENCE } from "./money.js";
import { formatRecoveryMessagePounds, recoveryMessageRecipientV1 } from "./recovery-message.js";

/** M4-16 dark seam. Pure proposals and deterministic fixtures; no adapter or scheduling owner. */
export const DUNNING_POLICY = Object.freeze({
  version: "dunning-reference.v1", status: "proposed", environment: "synthetic_demo",
  retryAfterTicks: Object.freeze([1, 3, 7]), maxAttempts: 3, maximumPence: MAX_MONEY_PENCE,
  authorityPolicy: "standing_authority_policy_v3", executionEnabled: false,
} as const);
const id = z.guid();
const tick = z.number().int().safe().nonnegative();
const revision = z.number().int().safe().positive();
const pence = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const category = z.enum(["customer", "supplier", "platform_to_builder"]);
const scopeV1 = z.object({
  version: z.literal("dunning-scope.v1"), environment: z.literal("synthetic_demo"),
  tenantId: id, jobId: id, permission: z.literal("manage_dunning"),
}).strict();
export type DunningScope = z.infer<typeof scopeV1>;

/** Server-loaded invoice projection, never a client balance or a view of hidden findings. */
export const dunningInvoiceV1 = z.object({
  version: z.literal("dunning-invoice.v1"), environment: z.literal("synthetic_demo"),
  tenantId: id, jobId: id, invoiceId: id, revision,
  sourceRevision: revision, sourceHash: hash,
  sourceState: z.enum(["issued_invoice", "locked_final_account", "draft_final_account", "superseded_final_account"]),
  finalAccountLockId: id.nullable(),
  currency: z.literal("GBP"), originalPence: pence, outstandingPence: pence,
  dueTick: tick, category, recipient: recoveryMessageRecipientV1,
  pilotNoCharge: z.boolean(), disputed: z.boolean(), refundPending: z.boolean(),
  reversed: z.boolean(), cancelled: z.boolean(),
  attemptState: z.enum(["none", "definite_failure", "pending", "outcome_unknown", "settled"]),
}).strict().refine(value => value.outstandingPence <= value.originalPence)
  .refine(value => value.sourceState !== "locked_final_account" || value.finalAccountLockId !== null);
export type DunningInvoice = z.infer<typeof dunningInvoiceV1>;
export type DunningErrorCode = "INVALID_DUNNING_INPUT" | "DUNNING_UNAVAILABLE" | "DUNNING_CONFLICT" | "DUNNING_DARK";
export class DunningError extends Error {
  constructor(readonly code: DunningErrorCode) { super(code); this.name = "DunningError"; }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const value = schema.safeParse(raw);
  if (!value.success) throw new DunningError("INVALID_DUNNING_INPUT");
  return value.data;
}
function scoped(scope: DunningScope, invoice: DunningInvoice): void {
  if (scope.tenantId !== invoice.tenantId || scope.jobId !== invoice.jobId) throw new DunningError("DUNNING_UNAVAILABLE");
}
export function dunningSuppression(invoice: DunningInvoice, nowTick: number): string | null {
  if (invoice.pilotNoCharge) return "pilot_no_charge";
  if (invoice.cancelled) return "cancelled";
  if (invoice.disputed) return "disputed";
  if (invoice.refundPending) return "refund_pending";
  if (invoice.reversed) return "reversed";
  if (invoice.outstandingPence === 0 || invoice.attemptState === "settled") return "paid";
  if (invoice.sourceState === "draft_final_account" || invoice.sourceState === "superseded_final_account") return "source_not_current";
  if (invoice.attemptState === "pending" || invoice.attemptState === "outcome_unknown") return "reconcile_attempt";
  return nowTick < invoice.dueTick ? "not_due" : null;
}

/** Tenant/job-filtered projection with data-free diagnostics for malformed source rows. */
export function unpaidInvoiceWorkbench(rawScope: unknown, rawInvoices: readonly unknown[], rawTick: unknown) {
  const scope = parse(scopeV1, rawScope), nowTick = parse(tick, rawTick);
  const skipped: Readonly<{ rowIndex: number; reasonCode: "INVALID_DUNNING_INPUT" }>[] = [];
  const invoices = rawInvoices.flatMap((raw, rowIndex) => {
    const result = dunningInvoiceV1.safeParse(raw);
    if (result.success) return [result.data];
    skipped.push(Object.freeze({ rowIndex, reasonCode: "INVALID_DUNNING_INPUT" }));
    return [];
  });
  const rows = invoices.filter(row => row.tenantId === scope.tenantId && row.jobId === scope.jobId && row.outstandingPence > 0)
    .map(row => Object.freeze({ invoiceId: row.invoiceId, revision: row.revision,
      amount: Object.freeze({ pence: row.outstandingPence, currency: row.currency }), category: row.category,
      suppression: dunningSuppression(row, nowTick), action: "review_only" as const }));
  return Object.freeze({ invoices: Object.freeze(rows), skippedCount: skipped.length, skipped: Object.freeze(skipped) });
}

/** Exact content binding is generated again from current facts at every approval check. */
export function buildDunningReminder(rawScope: unknown, rawInvoice: unknown, rawTick: unknown) {
  const scope = parse(scopeV1, rawScope), invoice = parse(dunningInvoiceV1, rawInvoice), nowTick = parse(tick, rawTick);
  scoped(scope, invoice);
  if (dunningSuppression(invoice, nowTick)) throw new DunningError("DUNNING_UNAVAILABLE");
  const content = Object.freeze({
    version: "dunning-reminder.v1", action: "dunning.reminder.preview", tenantId: invoice.tenantId,
    jobId: invoice.jobId, invoiceId: invoice.invoiceId, revision: invoice.revision,
    sourceRevision: invoice.sourceRevision, sourceHash: invoice.sourceHash, sourceState: invoice.sourceState,
    finalAccountLockId: invoice.finalAccountLockId, category: invoice.category, recipient: invoice.recipient,
    amount: Object.freeze({ pence: invoice.outstandingPence, currency: invoice.currency }),
    policyVersion: DUNNING_POLICY.version,
    body: `Practice reminder — not sent. ${invoice.category === "platform_to_builder" ? "The example platform invoice" : "The example job invoice"} has £${formatRecoveryMessagePounds(invoice.outstandingPence)} outstanding. Please review the example invoice.`,
  });
  return Object.freeze({ ...content, contentHash: sha256(JSON.stringify(content)) });
}
export type DunningReminder = ReturnType<typeof buildDunningReminder>;
const approvalV1 = z.object({
  version: z.literal("dunning-approval.v1"), decisionId: id, tenantId: id, jobId: id, invoiceId: id,
  action: z.literal("dunning.reminder.preview"), status: z.enum(["approved", "pending", "dismissed", "revoked", "expired", "superseded"]),
  contentHash: hash, policyVersion: z.literal(DUNNING_POLICY.version), expiresTick: tick,
}).strict();

/** Fixture validation only. The resolver must load a stored Decision, never echo caller input.
 * Returning true never grants real send or collection authority. */
export function dunningApprovalMatches(rawScope: unknown, rawInvoice: unknown, rawApproval: unknown, rawTick: unknown,
  resolveDecision?: (decisionId: string) => unknown): boolean {
  const approval = parse(approvalV1, rawApproval), nowTick = parse(tick, rawTick);
  const reminder = buildDunningReminder(rawScope, rawInvoice, nowTick);
  const stored = approvalV1.safeParse(resolveDecision?.(approval.decisionId));
  if (!stored.success || Object.keys(approvalV1.shape).some(key =>
    approval[key as keyof typeof approval] !== stored.data[key as keyof typeof approval])) return false;
  return approval.status === "approved" && approval.expiresTick > nowTick && approval.contentHash === reminder.contentHash
    && approval.tenantId === reminder.tenantId && approval.jobId === reminder.jobId && approval.invoiceId === reminder.invoiceId;
}

const commandV1 = z.object({ version: z.literal("dunning-command.v1"), commandId: id, idempotencyKey: id,
  invoiceId: id, expectedRevision: revision, action: z.enum(["request_reminder", "cancel_collection"]),
}).strict();
type PendingReminder = Readonly<{ decisionId: string; status: "pending"; reminder: DunningReminder }>;

/** In-memory fake for command semantics only. No runtime registration, persistence, audit or outbox claim. */
export class DunningFixtureWorkbench {
  private readonly invoices = new Map<string, DunningInvoice>();
  private readonly commands = new Map<string, { fingerprint: string; result: PendingReminder | null }>();
  private readonly cancelled = new Set<string>();
  private readonly decisions = new Map<string, PendingReminder>();
  constructor(fixtures: readonly unknown[]) {
    for (const raw of fixtures) {
      const row = parse(dunningInvoiceV1, raw), key = `${row.tenantId}:${row.invoiceId}`;
      if (this.invoices.has(key)) throw new DunningError("DUNNING_CONFLICT");
      this.invoices.set(key, row);
    }
  }
  /** Monotonic server fact replacement; cancelled collection never revives on a late event. */
  replace(raw: unknown): void {
    const row = parse(dunningInvoiceV1, raw), key = `${row.tenantId}:${row.invoiceId}`, prior = this.invoices.get(key);
    if (!prior || prior.jobId !== row.jobId || row.revision <= prior.revision) throw new DunningError("DUNNING_CONFLICT");
    this.invoices.set(key, row);
    this.decisions.delete(key);
  }
  command(rawScope: unknown, rawCommand: unknown, rawTick: unknown): PendingReminder | null {
    const scope = parse(scopeV1, rawScope), command = parse(commandV1, rawCommand), nowTick = parse(tick, rawTick);
    const key = `${scope.tenantId}:${command.invoiceId}`, invoice = this.invoices.get(key);
    if (!invoice) throw new DunningError("DUNNING_UNAVAILABLE");
    scoped(scope, invoice);
    const fingerprint = sha256(JSON.stringify({ jobId: scope.jobId, ...command }));
    const keys = [command.commandId, command.idempotencyKey].map(value => `${scope.tenantId}:${value}`);
    const previous = keys.map(value => this.commands.get(value));
    if (previous.some(value => value && value.fingerprint !== fingerprint)) throw new DunningError("DUNNING_CONFLICT");
    if (previous[0] && previous[1]) {
      const result = previous[0].result;
      if (result && (this.cancelled.has(key) || result.reminder.contentHash !== buildDunningReminder(scope, invoice, nowTick).contentHash)) {
        throw new DunningError("DUNNING_UNAVAILABLE");
      }
      return result;
    }
    if (command.expectedRevision !== invoice.revision) throw new DunningError("DUNNING_CONFLICT");
    let result: PendingReminder | null = null;
    if (command.action === "cancel_collection") {
      this.cancelled.add(key);
      this.decisions.delete(key);
    } else {
      if (this.cancelled.has(key)) throw new DunningError("DUNNING_UNAVAILABLE");
      const reminder = buildDunningReminder(scope, invoice, nowTick);
      result = this.decisions.get(key) ?? Object.freeze({ decisionId: command.commandId, status: "pending", reminder } as const);
      this.decisions.set(key, result);
    }
    for (const value of keys) this.commands.set(value, { fingerprint, result });
    return result;
  }
  list(rawScope: unknown, rawTick: unknown) {
    return unpaidInvoiceWorkbench(rawScope, [...this.invoices.values()].map(row =>
      this.cancelled.has(`${row.tenantId}:${row.invoiceId}`) ? { ...row, cancelled: true } : row), rawTick);
  }
}

const retryV1 = z.object({ version: z.literal("dunning-retry.v1"), owner: z.enum(["existing_payment_owner", "provider", "other"]),
  attempts: tick, failedAtTick: tick, authority: z.enum(["approved", "expired", "revoked", "failed_consent", "missing"]),
  authorityId: id, tenantId: id, jobId: id, invoiceId: id, invoiceRevision: revision,
  expiresTick: tick, remainingAuthorityPence: pence, providerAllowsRetry: z.boolean(),
  d05Approved: z.boolean(), authorityPolicy: z.literal(DUNNING_POLICY.authorityPolicy),
}).strict();
/** Advice to the existing owner only. Does not reserve, enqueue, retry, send, or collect. */
export function evaluateDunningRetry(rawScope: unknown, rawInvoice: unknown, rawRetry: unknown, rawTick: unknown) {
  const scope = parse(scopeV1, rawScope), invoice = parse(dunningInvoiceV1, rawInvoice);
  const retry = parse(retryV1, rawRetry), nowTick = parse(tick, rawTick);
  scoped(scope, invoice);
  if (retry.tenantId !== invoice.tenantId || retry.jobId !== invoice.jobId || retry.invoiceId !== invoice.invoiceId
    || retry.invoiceRevision !== invoice.revision) throw new DunningError("DUNNING_UNAVAILABLE");
  const suppression = dunningSuppression(invoice, nowTick);
  const reason = suppression ?? (retry.owner !== "existing_payment_owner" ? "owner_conflict"
    : !retry.d05Approved || retry.authority !== "approved" || retry.expiresTick <= nowTick ? "renew_authority"
    : !retry.providerAllowsRetry ? "provider_refused"
    : retry.remainingAuthorityPence < invoice.outstandingPence ? "authority_limit"
    : invoice.attemptState !== "definite_failure" ? "no_failed_attempt"
    : retry.attempts >= DUNNING_POLICY.maxAttempts ? "attempt_limit"
    : BigInt(nowTick) < BigInt(retry.failedAtTick) + BigInt(DUNNING_POLICY.retryAfterTicks[retry.attempts]!) ? "not_due"
    : "review_existing_owner");
  return Object.freeze({ version: "dunning-retry-result.v1", reason, executable: false, owner: "existing_payment_owner" });
}

/** Closed inventory for this dark seam, not evidence of live provider dashboard settings. */
export const DUNNING_PROVIDER_AUTOMATION = Object.freeze([
  ["stripe", "smart_retries"], ["stripe", "subscription_retry_schedule"],
  ["stripe", "invoice_reminders"], ["stripe", "payment_failure_email"],
  ["stripe", "receipt_email"], ["stripe", "refund_email"], ["stripe", "subscription_lifecycle_email"],
  ["gocardless", "payment_retries"], ["gocardless", "mandate_email"],
  ["gocardless", "advance_notice_email"], ["gocardless", "failure_email"],
  ["gocardless", "cancellation_email"], ["gocardless", "refund_email"],
].map(([provider, automation]) => Object.freeze({ provider, automation, state: "disabled" as const,
  scope: "dark_seam_only" as const, liveVerified: false as const })));

/** Reference access policy: service changes stop new work, never erase financial/evidence history. */
export function dunningServiceAccess(raw: unknown) {
  const request = parse(z.object({ version: z.literal("dunning-service.v1"), environment: z.literal("synthetic_demo"),
    policyVersion: z.literal("dunning-access-reference.v1"), status: z.enum(["active", "suspended", "cancelled"]),
  }).strict(), raw);
  return Object.freeze({ ...request, policyStatus: "proposed", newWork: request.status === "active",
    collection: request.status === "active", ledger: true, evidence: true, export: true, deleteData: false });
}

/** Hard refusal, independent of environment flags supplied by any caller. */
export function executeDunning(): never { throw new DunningError("DUNNING_DARK"); }
