import { createHash } from "node:crypto";
import {
  AccountingExportError, accountingCommandV1, accountingDecisionV1, accountingScopeV1, accountingSourceV1, accountingTargetV1,
  parseAccounting, type AccountingScope, type AccountingSource, type AccountingTarget, type ExportCode,
} from "./accounting-export.contracts.js";

function fail(code: ExportCode): never { throw new AccountingExportError(code); }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = (...parts: string[]) => JSON.stringify(parts);
type Context = { tenantId: string; actorId: string; canExport: boolean };
type Consent = { tenantId: string; companyId: string; revision: number; expiresAt: number; revoked: boolean };
type External = { id: string; reference: string; contentHash: string; paid: boolean; payload: AccountingTarget };
export type ExportStatus = "pending" | "pushed" | "failed" | "outcome_unknown" | "external_edit" | "duplicate_import" | "reference_conflict" | "confirmed_absent";
type Entry = { tenantId: string; jobId: string; companyId: string; sourceId: string;
  sourceRevision: number; mappingRevision: number; kind: AccountingSource["kind"]; invoiceId: string | null; pence: number; reference: string; contentHash: string;
  status: ExportStatus; externalId: string | null; attempts: number; qualifyingRecoveryProof: false };

/** Deterministic fake only: no SDK, credentials, URLs, callbacks or network methods. */
export class FakeCodatAdapter {
  readonly objects: External[] = [];
  next: "success" | "reject" | "unknown_before" | "unknown_after" = "success";
  pushes = 0;
  push(reference: string, contentHash: string, input: unknown): External {
    const payload = parseAccounting(accountingTargetV1, input);
    this.pushes++;
    const mode = this.next; this.next = "success";
    if (mode === "reject" || mode === "unknown_before") throw new Error(mode);
    const object = { id: `demo-external-${this.pushes}`, reference, contentHash, paid: false, payload: structuredClone(payload) };
    this.objects.push(object);
    if (mode === "unknown_after") throw new Error(mode);
    return structuredClone(object);
  }
  find(reference: string): External[] { return this.objects.filter(o => o.reference === reference).map(o => structuredClone(o)); }
}

/** In-memory executable contract, deliberately unregistered in the API/worker. Not a durable production executor. */
export class AccountingExportSandbox {
  private readonly sources = new Map<string, AccountingSource>();
  private readonly consents = new Map<string, Consent>();
  private readonly entries = new Map<string, Entry>();
  private readonly commands = new Map<string, { fingerprint: string; effect: string }>();
  private readonly decisions = new Map<string, string>();
  private readonly artifacts = new Map<string, ReturnType<AccountingExportSandbox["preview"]>["artifact"]>();
  private readonly audit: { tenantId: string; reference: string; status: ExportStatus }[] = [];
  constructor(private readonly adapter: FakeCodatAdapter, sources: unknown[], consents: Consent[],
    private readonly syntheticEnabled = false) {
    for (const source of sources) this.setSyntheticSource(source);
    for (const consent of consents) this.setSyntheticConsent(consent);
  }
  // Fixture administration only; never exposed as application endpoints.
  setSyntheticSource(input: unknown): void {
    const source = parseAccounting(accountingSourceV1, input);
    this.sources.set(key(source.tenantId, source.sourceId), structuredClone(source));
  }
  setSyntheticConsent(consent: Consent): void {
    if (!/^demo-[a-z0-9-]+$/.test(consent.tenantId) || !/^demo-[a-z0-9-]+$/.test(consent.companyId) ||
      !Number.isSafeInteger(consent.expiresAt) || !Number.isSafeInteger(consent.revision) || consent.revision < 1) fail("invalid_input");
    this.consents.set(key(consent.tenantId, consent.companyId), { ...consent });
  }
  private authorize(ctx: Context, scope: AccountingScope, now: number) {
    if (!this.syntheticEnabled) fail("disabled");
    if (!Number.isSafeInteger(now)) fail("invalid_input");
    if (!ctx.canExport || ctx.tenantId !== scope.tenantId || !/^demo-[a-z0-9-]+$/.test(ctx.actorId)) fail("forbidden");
    const consent = this.consents.get(key(scope.tenantId, scope.companyId));
    if (!consent || consent.revoked || consent.expiresAt <= now) fail("consent_expired");
    return consent;
  }
  preview(ctx: Context, input: unknown, now: number) {
    const scope = parseAccounting(accountingScopeV1, input);
    const consent = this.authorize(ctx, scope, now);
    if (scope.mapping.tenantId !== scope.tenantId || scope.mapping.companyId !== scope.companyId) fail("reference_conflict");
    const source = this.sources.get(key(scope.tenantId, scope.sourceId));
    if (!source || source.jobId !== scope.jobId || source.revision !== scope.sourceRevision ||
      (source.kind === "customer_invoice" ? source.state !== "issued" : source.state !== "posted")) fail("source_unavailable");
    if (source.finalAccount && source.finalAccount.revision !== source.finalAccount.lockedRevision) fail("source_unavailable");
    if (source.kind === "customer_invoice" ? source.invoiceId !== null || source.invoiceRevision !== null : source.invoiceId === null || source.invoiceRevision === null) fail("reference_conflict");
    if (source.invoiceId) {
      const invoice = this.sources.get(key(scope.tenantId, source.invoiceId));
      if (!invoice || invoice.revision !== source.invoiceRevision || (invoice.finalAccount && invoice.finalAccount.revision !== invoice.finalAccount.lockedRevision) || invoice.jobId !== scope.jobId || invoice.kind !== "customer_invoice" || invoice.state !== "issued" ||
        source.amount.pence > invoice.amount.pence) fail("reference_conflict");
      const allocated = [...this.entries.values()].filter(e => e.tenantId === scope.tenantId && e.companyId === scope.companyId && e.sourceId !== source.sourceId)
        .filter(e => e.invoiceId === source.invoiceId && e.kind === source.kind)
        .reduce((sum, e) => sum + BigInt(e.pence), 0n);
      if (allocated + BigInt(source.amount.pence) > BigInt(invoice.amount.pence)) fail("reference_conflict");
    }
    const target = parseAccounting(accountingTargetV1, {
      version: 1, companyId: scope.companyId,
      objectType: { customer_invoice: "invoice", credit: "credit_note", receipt: "payment" }[source.kind],
      sourceId: source.sourceId, sourceRevision: source.revision, invoiceId: source.invoiceId, invoiceRevision: source.invoiceRevision,
      amount: source.amount, accountId: scope.mapping.accountId, customerId: scope.mapping.customerId,
      tax: source.tax, retention: source.retention, cis: source.cis, drc: source.drc,
    });
    const artifact = { version: 1, direction: "push", scope, source, consentRevision: consent.revision,
      target };
    return structuredClone({ artifact, previewHash: hash(artifact), warning: "Synthetic only; unsupported tax/retention/CIS/DRC; no settlement proof" });
  }
  confirmPreview(ctx: Context, scopeInput: unknown, decisionInput: unknown, now: number) {
    const preview = this.preview(ctx, scopeInput, now);
    const decision = parseAccounting(accountingDecisionV1, decisionInput);
    if (decision.tenantId !== ctx.tenantId || decision.actorId !== ctx.actorId || decision.expiresAt <= now ||
      decision.previewHash !== preview.previewHash) fail("approval_required");
    const decisionKey = key(ctx.tenantId, decision.decisionId);
    const prior = this.decisions.get(decisionKey);
    if (prior && prior !== hash(decision)) fail("replay_conflict");
    this.decisions.set(decisionKey, hash(decision));
    return structuredClone(decision);
  }
  revokeConfirmation(ctx: Context, input: unknown): void {
    if (!this.syntheticEnabled) fail("disabled");
    const decision = parseAccounting(accountingDecisionV1, input);
    if (!ctx.canExport || decision.tenantId !== ctx.tenantId || decision.actorId !== ctx.actorId) fail("forbidden");
    const decisionKey = key(ctx.tenantId, decision.decisionId);
    if (this.decisions.get(decisionKey) !== hash(decision)) fail("approval_required");
    this.decisions.set(decisionKey, "revoked");
  }
  push(ctx: Context, input: unknown, now: number): Entry {
    const command = parseAccounting(accountingCommandV1, input);
    const preview = this.preview(ctx, command.scope, now);
    const { decision, scope } = command;
    if (decision.tenantId !== ctx.tenantId || decision.actorId !== ctx.actorId || decision.expiresAt <= now ||
      decision.previewHash !== preview.previewHash ||
      this.decisions.get(key(ctx.tenantId, decision.decisionId)) !== hash(decision)) fail("approval_required");
    const effect = key(scope.tenantId, scope.companyId, scope.sourceId);
    const fingerprint = hash(command);
    const replayKeys = [key(ctx.tenantId, "command", command.commandId), key(ctx.tenantId, "idempotency", command.idempotencyKey)];
    for (const replayKey of replayKeys) {
      const prior = this.commands.get(replayKey);
      if (prior && prior.fingerprint !== fingerprint) fail("replay_conflict");
    }
    const existing = this.entries.get(effect);
    if (existing && existing.contentHash !== preview.previewHash) fail("reference_conflict");
    const entry: Entry = existing ?? { tenantId: scope.tenantId, jobId: scope.jobId, companyId: scope.companyId,
      sourceId: scope.sourceId, sourceRevision: scope.sourceRevision, mappingRevision: scope.mapping.revision,
      kind: preview.artifact.source.kind, invoiceId: preview.artifact.source.invoiceId, pence: preview.artifact.source.amount.pence,
      reference: hash(effect), contentHash: preview.previewHash, status: "pending", externalId: null, attempts: 0, qualifyingRecoveryProof: false };
    for (const replayKey of replayKeys) this.commands.set(replayKey, { fingerprint, effect });
    this.entries.set(effect, entry);
    this.artifacts.set(effect, structuredClone(preview.artifact));
    if (entry.status === "pushed") return structuredClone(entry);
    if (entry.status !== "pending" && entry.status !== "confirmed_absent") fail("reconcile_required");
    // Always reconcile before create, even on the first attempt (e.g. a prior import).
    if (this.adapter.find(entry.reference).length) return this.reconcile(ctx, scope, now);
    entry.attempts++;
    try {
      const result = this.adapter.push(entry.reference, entry.contentHash, preview.artifact.target);
      entry.externalId = result.id; entry.status = "pushed";
    } catch (error) {
      entry.status = error instanceof Error && error.message === "reject" ? "failed" : "outcome_unknown";
    }
    this.audit.push({ tenantId: ctx.tenantId, reference: entry.reference, status: entry.status });
    return structuredClone(entry);
  }
  reconcile(ctx: Context, input: unknown, now: number): Entry {
    const scope = parseAccounting(accountingScopeV1, input);
    this.authorize(ctx, scope, now);
    const entry = this.entries.get(key(scope.tenantId, scope.companyId, scope.sourceId));
    if (!entry || entry.jobId !== scope.jobId || entry.sourceRevision !== scope.sourceRevision) fail("source_unavailable");
    const matches = this.adapter.find(entry.reference);
    if (matches.length > 1) entry.status = "duplicate_import";
    else if (matches.length === 0) entry.status = entry.externalId ? "reference_conflict" : "confirmed_absent";
    else {
      const found = matches[0]!;
      if (entry.externalId && entry.externalId !== found.id) entry.status = "reference_conflict";
      else if (entry.contentHash !== found.contentHash ||
        hash(this.artifacts.get(key(scope.tenantId, scope.companyId, scope.sourceId))?.target) !== hash(found.payload)) entry.status = "external_edit";
      else { entry.externalId = found.id; entry.status = "pushed"; }
    }
    this.audit.push({ tenantId: ctx.tenantId, reference: entry.reference, status: entry.status });
    return structuredClone(entry);
  }
  ledger(ctx: Context, input: unknown, now: number) {
    const scope = parseAccounting(accountingScopeV1, input);
    this.authorize(ctx, scope, now);
    const effect = key(scope.tenantId, scope.companyId, scope.sourceId);
    const entry = this.entries.get(effect);
    if (!entry || entry.jobId !== scope.jobId) fail("source_unavailable");
    return structuredClone({ entry, artifact: this.artifacts.get(effect) });
  }
  history(ctx: Context) {
    if (!this.syntheticEnabled) fail("disabled");
    if (!ctx.canExport) fail("forbidden");
    return structuredClone(this.audit.filter(e => e.tenantId === ctx.tenantId));
  }
}
