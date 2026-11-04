import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";

const id = z.string().uuid();
const amount = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const positive = amount.refine(n => n > 0);
const scope = { tenantId: id, jobId: id };
const invoice = z.object({ ...scope, id, revision: id, net: amount, vat: amount, gross: positive }).strict();
const provider = z.object({
 ...scope, id, effectId: id, invoiceId: id, kind: z.enum(["payment", "refund", "fee", "payout", "bank"]),
 amount: positive, parentId: id.nullable(), late: z.boolean(),
}).strict();
const journal = z.object({
 ...scope, id, invoiceId: id, kind: z.enum(["payment", "refund", "fee", "payout", "allocation", "allocation_reversal", "reservation", "release"]),
 amount: positive, sourceId: id,
}).strict();
const correction = z.object({ ...scope, id, invoiceId: id, target: z.enum(["provider", "journal"]), voidId: id, duplicateOf: id }).strict();
export const financialReconciliationSnapshotV1 = z.object({
 version: z.literal("financial-reconciliation-snapshot.v1"), environment: z.literal("synthetic_demo"), ...scope,
 corrections: z.array(correction).max(10_000).default([]),
 invoices: z.array(invoice).max(10_000), provider: z.array(provider).max(10_000), journals: z.array(journal).max(10_000),
}).strict();
type Snapshot = z.infer<typeof financialReconciliationSnapshotV1>;
type Provider = z.infer<typeof provider>;
type Journal = z.infer<typeof journal>;
export class FinancialReconciliationError extends Error {
 constructor(readonly code: "INVALID_RECONCILIATION" | "RECONCILIATION_DISABLED" | "RECONCILIATION_FORBIDDEN" | "RECONCILIATION_CONFLICT" = "INVALID_RECONCILIATION") {
  super(code); this.name = "FinancialReconciliationError";
 }
}
const fail = (code: FinancialReconciliationError["code"] = "INVALID_RECONCILIATION"): never => { throw new FinancialReconciliationError(code); };
const sorted = (rows: { id: string }[]) => rows.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
// Only fixed schema objects enter this encoder; optional undefined fields are omitted.
function canonical(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
 if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
 return JSON.stringify(value);
}
const hash = (value: unknown) => sha256(`financial-reconciliation.v1\n${canonical(value)}`);
const total = (rows: readonly { amount: number }[]) => rows.reduce((n,r) => n + BigInt(r.amount), 0n);
function snapshot(raw: unknown): Snapshot {
 const parsed = financialReconciliationSnapshotV1.safeParse(raw);
 if (!parsed.success) return fail();
 const s = parsed.data;
 for (const rows of [s.invoices, s.provider, s.journals, s.corrections]) {
  for (const row of rows) if (row.tenantId !== s.tenantId || row.jobId !== s.jobId) fail("RECONCILIATION_FORBIDDEN");
  if (new Set(rows.map(r => r.id)).size !== rows.length) fail();
  sorted(rows);
 }
 for (const i of s.invoices) if (BigInt(i.net) + BigInt(i.vat) !== BigInt(i.gross)) fail();
 for (const p of s.provider) if ((p.kind === "payment") !== (p.parentId === null)) fail();
 const removed = new Set<string>();
 for (const c of s.corrections) {
  const rows = c.target === "provider" ? s.provider : s.journals;
  const original = rows.find(r => r.id === c.voidId), kept = rows.find(r => r.id === c.duplicateOf);
  if (!original || !kept || original.id === kept.id || original.invoiceId !== c.invoiceId || kept.invoiceId !== c.invoiceId || removed.has(`${c.target}:${c.voidId}`)) fail();
  // Only an exact duplicate observation can be voided; amounts cannot be waived or rewritten.
  const economics = (r: typeof original) => { const { id: _id, ...rest } = r!; void _id; return rest; };
  if (hash(economics(original)) !== hash(economics(kept))) fail();
  removed.add(`${c.target}:${c.voidId}`);
 }
 for (const c of s.corrections) if (removed.has(`${c.target}:${c.duplicateOf}`)) fail();
 return s;
}
type Issue = { code: string; refs: string[]; expected: ReturnType<typeof moneyFromBigInt> | null; observed: ReturnType<typeof moneyFromBigInt> | null };
/** Pure comparison of made-up records. Never verifies settlement, qualifies recovery or posts money. */
export function reconcileFinancialSnapshot(raw: unknown) {
 try { return compare(snapshot(raw)); } catch (e) { if (e instanceof FinancialReconciliationError) throw e; return fail(); }
}
function compare(s: Snapshot) {
 // Corrections are new immutable facts; the observations they explain remain in the source hash.
 const sourceHash = hash(s);
 s = { ...s, provider: s.provider.filter(p => !s.corrections.some(c => c.target === "provider" && c.voidId === p.id)),
  journals: s.journals.filter(j => !s.corrections.some(c => c.target === "journal" && c.voidId === j.id)) };
 const issues: Issue[] = [];
 const add = (code: string, refs: string[], expected?: bigint, observed?: bigint) => {
  issues.push({ code, refs: [...new Set(refs)].sort(), expected: expected === undefined ? null : moneyFromBigInt(expected), observed: observed === undefined ? null : moneyFromBigInt(observed) });
 };
 const invoices = new Map(s.invoices.map(i => [i.id,i]));
 const events = new Map(s.provider.map(p => [p.id,p]));
 const blocked = new Set<string>();
 const effects = new Map<string, Provider[]>();
 for (const p of s.provider) { const group = effects.get(p.effectId) ?? []; group.push(p); effects.set(p.effectId,group); }
 for (const group of effects.values()) if (group.length > 1) {
  add("DUPLICATE_PROVIDER_EFFECT", group.map(p => p.id)); group.forEach(p => blocked.add(p.id));
 }
 for (const p of s.provider) {
  if (!invoices.has(p.invoiceId)) { add("ORPHAN_PROVIDER_PAYMENT", [p.id]); blocked.add(p.id); }
  if (p.late) add("LATE_PROVIDER_EVENT", [p.id]);
  if (p.kind === "payment") continue;
  const parent = events.get(p.parentId!);
  if (!parent || parent.kind !== (p.kind === "bank" ? "payout" : "payment") || parent.invoiceId !== p.invoiceId) {
   add("MISSING_OR_WRONG_PREDECESSOR", [p.id,p.parentId!]); blocked.add(p.id);
  }
 }
 // Validate grouped source limits, independent of delivery order. All ambiguous siblings are excluded.
 for (const p of s.provider.filter(p => p.kind === "payment" || p.kind === "payout")) {
  const children = s.provider.filter(c => c.parentId === p.id && !blocked.has(c.id));
  const kinds = p.kind === "payout" ? ["bank"] : ["refund", "fee", "payout"];
  const used = children.filter(c => kinds.includes(c.kind));
  if (total(used) > BigInt(p.amount)) {
   add("SOURCE_AMOUNT_EXCEEDED", [p.id,...used.map(c => c.id)], BigInt(p.amount), total(used));
   used.forEach(c => blocked.add(c.id));
  }
 }
 // A blocked original never establishes money for a dependent fee/refund/payout/bank observation.
 for (let depth = 0; depth < 2; depth++) for (const p of s.provider) {
  if (p.parentId !== null && blocked.has(p.parentId) && !blocked.has(p.id)) {
   blocked.add(p.id); add("BLOCKED_PREDECESSOR", [p.id,p.parentId]);
  }
 }
 const valid = s.provider.filter(p => !blocked.has(p.id));
 const validIds = new Set(valid.map(p => p.id));
 const journalById = new Map(s.journals.map(j => [j.id,j]));
 let accepted: Journal[] = [];
 for (const j of s.journals) {
  if (!invoices.has(j.invoiceId)) { add("ORPHAN_JOURNAL", [j.id]); continue; }
  if (["payment", "refund", "fee", "payout"].includes(j.kind)) {
   const p = events.get(j.sourceId);
   if (!p || !validIds.has(p.id) || p.kind !== j.kind || p.invoiceId !== j.invoiceId) { add("JOURNAL_SOURCE_MISMATCH", [j.id,j.sourceId]); continue; }
  } else if (j.kind === "allocation" || j.kind === "reservation") {
   const p = events.get(j.sourceId);
   if (!p || !validIds.has(p.id) || p.kind !== "payment" || p.invoiceId !== j.invoiceId) { add("JOURNAL_SOURCE_MISMATCH", [j.id,j.sourceId]); continue; }
  } else {
   const original = journalById.get(j.sourceId);
   if (!original || original.kind !== (j.kind === "release" ? "reservation" : "allocation") || original.invoiceId !== j.invoiceId) {
    add("REVERSAL_DISCREPANCY", [j.id,j.sourceId]); continue;
   }
  }
  accepted.push(j);
 }
 const acceptedIds = new Set(accepted.map(j => j.id));
 accepted = accepted.filter(j => {
  if ((j.kind === "release" || j.kind === "allocation_reversal") && !acceptedIds.has(j.sourceId)) {
   add("REVERSAL_DISCREPANCY", [j.id,j.sourceId]); return false;
  }
  return true;
 });
 for (const p of valid.filter(p => p.kind !== "bank")) {
  const rows = accepted.filter(j => j.sourceId === p.id && j.kind === p.kind);
  if (rows.length !== 1 || total(rows) !== BigInt(p.amount)) add("MISSING_OR_DUPLICATE_JOURNAL", [p.id,...rows.map(j => j.id)], BigInt(p.amount), total(rows));
 }
 for (const original of accepted.filter(j => j.kind === "allocation" || j.kind === "reservation")) {
  const reversed = accepted.filter(j => j.sourceId === original.id && j.kind === (original.kind === "allocation" ? "allocation_reversal" : "release"));
  if (total(reversed) > BigInt(original.amount)) add("REVERSAL_DISCREPANCY", [original.id,...reversed.map(j => j.id)], BigInt(original.amount), total(reversed));
 }
 for (const p of valid.filter(p => p.kind === "payment")) {
  const linked = accepted.filter(j => j.sourceId === p.id && (j.kind === "allocation" || j.kind === "reservation"));
  const undo = accepted.filter(j => linked.some(l => l.id === j.sourceId) && (j.kind === "release" || j.kind === "allocation_reversal"));
  const available = BigInt(p.amount) - total(valid.filter(e => e.parentId === p.id && e.kind === "refund"));
  const used = total(linked) - total(undo);
  if (used < 0n || used > available) add("ALLOCATION_OR_RESERVATION_LIMIT", [p.id,...linked.map(j => j.id),...undo.map(j => j.id)], available, used);
 }
 const sum = (kind: Provider["kind"]) => total(valid.filter(p => p.kind === kind));
 const ledger = (kind: Journal["kind"]) => total(accepted.filter(j => j.kind === kind));
 for (const i of s.invoices) {
  const paid = total(valid.filter(p => p.kind === "payment" && p.invoiceId === i.id));
  const refunded = total(valid.filter(p => p.kind === "refund" && p.invoiceId === i.id));
  if (paid - refunded > BigInt(i.gross)) add("INVOICE_OVERPAYMENT", [i.id], BigInt(i.gross), paid - refunded);
 }
 const clearing = sum("payment") - sum("refund") - sum("fee") - sum("payout");
 const transit = sum("payout") - sum("bank");
 if (clearing !== 0n) add("OUTSTANDING_CLEARING", [], 0n, clearing);
 if (transit !== 0n) add("PAYOUT_AWAITING_BANK", [], sum("payout"), sum("bank"));
 const money = moneyFromBigInt;
 const balances = {
  invoicedGross: money(s.invoices.reduce((n,i) => n + BigInt(i.gross),0n)),
  invoiceOutstanding: money(s.invoices.reduce((n,i) => n + BigInt(i.gross),0n) - sum("payment") + sum("refund")),
  journalPayments: money(ledger("payment")), journalRefunds: money(ledger("refund")), journalFees: money(ledger("fee")), journalPayouts: money(ledger("payout")),
  invoicedNet: money(s.invoices.reduce((n,i) => n + BigInt(i.net),0n)), vat: money(s.invoices.reduce((n,i) => n + BigInt(i.vat),0n)),
  grossCharged: money(sum("payment")), refunds: money(sum("refund")), providerFees: money(sum("fee")),
  netPayout: money(sum("payout")), bankObserved: money(sum("bank")), outstandingClearing: money(clearing), payoutInTransit: money(transit),
  allocated: money(ledger("allocation") - ledger("allocation_reversal")), reserved: money(ledger("reservation") - ledger("release")),
 };
 const queue = issues.map(i => ({ ...i, differenceId: hash(i) })).sort((a,b) => a.differenceId < b.differenceId ? -1 : 1);
 return { version: "financial-reconciliation-report.v1" as const, sourceHash, productionEnabled: false as const,
  referenceOnly: true as const, authoritativeSourceVerification: false as const, realExternalActions: 0 as const, balances, queue };
}

const runCommand = z.object({ version: z.literal("financial-reconciliation-run.v1"), ...scope, commandId: id,
 trigger: z.enum(["daily", "on_demand"]), day: z.iso.date(), environment: z.literal("synthetic_demo") }).strict();
export const financialReconciliationAdjustmentV1 = z.object({ version: z.literal("financial-reconciliation-adjustment.v1"), ...scope, commandId: id,
 reportHash: z.string().regex(/^[a-f0-9]{64}$/u), invoiceRevision: id, fact: journal.optional(), correction: correction.optional(),
}).strict().refine(c => (c.fact !== undefined) !== (c.correction !== undefined));
export type ReconciliationAuthority = Readonly<{
 tenantId: string; jobId: string; actorId: string; currentMember: boolean; canRun: boolean; canAdjust: boolean;
 /** Implemented by the server authority seam, never an approved flag on the command. Fakes only here. */
 approves: (binding: Readonly<{ action: "append_reconciliation_fact"; contentHash: string; reportHash: string; actorId: string }>) => boolean;
}>;
/** In-memory fake operational seam. No HTTP route, durable writer, scheduler, provider or production switch. */
export class FakeFinancialReconciliationRunner {
 private state: Snapshot;
 private readonly commands = new Map<string, { hash: string; result: unknown }>();
 private readonly days = new Map<string, ReturnType<typeof reconcileFinancialSnapshot>>();
 private readonly history: { tenantId: string; jobId: string; actorId: string; action: "append_reconciliation_fact"; sequence: number;
  commandId: string; contentHash: string; previousHash: string | null; hash: string }[] = [];
 constructor(raw: unknown, private readonly enabled = false) { this.state = snapshot(raw); }
 private access(authority: ReconciliationAuthority, adjusting = false) {
  if (!this.enabled) fail("RECONCILIATION_DISABLED");
  if (!id.safeParse(authority.actorId).success || !authority.currentMember || authority.tenantId !== this.state.tenantId || authority.jobId !== this.state.jobId ||
   !(adjusting ? authority.canAdjust : authority.canRun)) fail("RECONCILIATION_FORBIDDEN");
 }
 private replay(commandId: string, contentHash: string) {
  const prior = this.commands.get(commandId);
  if (prior && prior.hash !== contentHash) fail("RECONCILIATION_CONFLICT");
  return prior;
 }
 run(raw: unknown, authority: ReconciliationAuthority) {
  this.access(authority);
  const parsed = runCommand.safeParse(raw); if (!parsed.success) return fail();
  const command = parsed.data;
  if (command.tenantId !== authority.tenantId || command.jobId !== authority.jobId) return fail("RECONCILIATION_FORBIDDEN");
  const contentHash = hash(command), prior = this.replay(command.commandId,contentHash);
  if (prior) return structuredClone(prior.result) as ReturnType<typeof reconcileFinancialSnapshot>;
  const report = command.trigger === "daily" ? this.days.get(command.day) ?? reconcileFinancialSnapshot(this.state) : reconcileFinancialSnapshot(this.state);
  if (command.trigger === "daily") this.days.set(command.day,report);
  this.commands.set(command.commandId,{ hash: contentHash, result: report });
  return structuredClone(report);
 }
 appendAdjustment(raw: unknown, authority: ReconciliationAuthority) {
  this.access(authority,true);
  const parsed = financialReconciliationAdjustmentV1.safeParse(raw); if (!parsed.success) return fail();
  const command = parsed.data, fact = command.fact ?? command.correction!;
  if (command.tenantId !== authority.tenantId || command.jobId !== authority.jobId || fact.tenantId !== authority.tenantId || fact.jobId !== authority.jobId) return fail("RECONCILIATION_FORBIDDEN");
  const contentHash = hash(command), prior = this.replay(command.commandId,contentHash);
  if (prior) return structuredClone(prior.result) as ReturnType<typeof reconcileFinancialSnapshot>;
  const before = reconcileFinancialSnapshot(this.state);
  if (before.sourceHash !== command.reportHash || this.state.invoices.find(i => i.id === fact.invoiceId)?.revision !== command.invoiceRevision || (command.fact ? this.state.journals : this.state.corrections).some(j => j.id === fact.id)) return fail("RECONCILIATION_CONFLICT");
  if (!authority.approves({ action: "append_reconciliation_fact", contentHash, reportHash: command.reportHash, actorId: authority.actorId })) return fail("RECONCILIATION_FORBIDDEN");
  const next = snapshot({ ...this.state,
   journals: command.fact ? [...this.state.journals,command.fact] : this.state.journals,
   corrections: command.correction ? [...this.state.corrections,command.correction] : this.state.corrections,
  });
  const result = reconcileFinancialSnapshot(next);
  // Appending an approved fact cannot introduce a new discrepancy or expand an existing one.
  const previous = new Set(before.queue.map(i => i.differenceId));
  if (result.queue.some(i => !previous.has(i.differenceId))) return fail("RECONCILIATION_CONFLICT");
  const previousHash = this.history.at(-1)?.hash ?? null;
  const audit = { tenantId: this.state.tenantId, jobId: this.state.jobId, actorId: authority.actorId,
   action: "append_reconciliation_fact" as const, sequence: this.history.length + 1, commandId: command.commandId, contentHash, previousHash };
  this.history.push({ ...audit, hash: hash(audit) });
  this.state = next;
  this.commands.set(command.commandId,{ hash: contentHash, result });
  return structuredClone(result);
 }
 /** Deterministic fake delivery: immutable observations; same ID replay is harmless, changed content refuses. */
 observe(raw: unknown, authority: ReconciliationAuthority) {
  this.access(authority);
  const parsed = provider.safeParse(raw); if (!parsed.success) return fail();
  const event = parsed.data;
  if (event.tenantId !== authority.tenantId || event.jobId !== authority.jobId) return fail("RECONCILIATION_FORBIDDEN");
  const prior = this.state.provider.find(p => p.id === event.id);
  if (prior) { if (hash(prior) !== hash(event)) fail("RECONCILIATION_CONFLICT"); return; }
  const next = snapshot({ ...this.state, provider: [...this.state.provider,event] });
  reconcileFinancialSnapshot(next); // Bounds before mutation; no partial writes.
  this.state = next;
 }
 inspect(authority: ReconciliationAuthority) { this.access(authority); return structuredClone({ snapshot: this.state, audit: this.history }); }
}
/** Exact fake Decision binding helper; hashes only validated commands and contains no recipient/free text. */
export function reconciliationAdjustmentHash(raw: unknown) {
 const parsed = financialReconciliationAdjustmentV1.safeParse(raw); if (!parsed.success) return fail(); return hash(parsed.data);
}
