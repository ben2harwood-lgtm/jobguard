import { createHash } from "node:crypto";
import {
  AccountingExportError, accountingCommandV1, accountingDecisionV1, accountingRouteDecisionV1, accountingScopeV1, accountingSourceV1, accountingTargetV1,
  parseAccounting, type AccountingScope, type AccountingSource, type ExportCode,
} from "./accounting-export.contracts.js";
import { type AccountingAdapter, type AccountingRoute, FakeRateLimit } from "./accounting-export.fake.js";
export { FakeCodatAdapter } from "./accounting-export.fake.js";

function fail(code: ExportCode): never { throw new AccountingExportError(code); }

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = (...parts: string[]) => JSON.stringify(parts);
type Context = { tenantId: string; actorId: string; canExport: boolean };
type Consent = { tenantId: string; companyId: string; revision: number; expiresAt: number; revoked: boolean };
export type ExportStatus = "pending" | "pushed" | "failed" | "outcome_unknown" | "external_edit" | "duplicate_import" | "reference_conflict" | "confirmed_absent" | "rate_limited";
type Entry = { tenantId: string; jobId: string; companyId: string; sourceId: string;
  sourceRevision: number; mappingRevision: number; kind: AccountingSource["kind"]; invoiceId: string | null; pence: number; reference: string; contentHash: string;
  status: ExportStatus; externalId: string | null; attempts: number; retryAt: number | null; qualifyingRecoveryProof: false };

/** In-memory executable contract, deliberately unregistered in the API/worker. Not a durable production executor. */
export class AccountingExportSandbox {
  private readonly sources = new Map<string, AccountingSource>();
  private readonly consents = new Map<string, Consent>();
  private readonly entries = new Map<string, Entry>();
  private readonly commands = new Map<string, { fingerprint: string; effect: string }>();
  private readonly decisions = new Map<string, string>();
  private readonly artifacts = new Map<string, ReturnType<AccountingExportSandbox["preview"]>["artifact"]>();
  private readonly audit: { tenantId: string; reference: string; status: ExportStatus }[] = [];
  private readonly adapters = new Map<AccountingRoute, AccountingAdapter>();
  private readonly routes = new Map<string, AccountingRoute>();
  private readonly routeChanges: { scope: AccountingScope; from: AccountingRoute; to: AccountingRoute; previewHash: string; decisionId: string }[] = [];
  constructor(private readonly adapter: AccountingAdapter, sources: unknown[], consents: Consent[],
    private readonly syntheticEnabled = false, alternatives: AccountingAdapter[] = []) {
    for (const candidate of [adapter, ...alternatives]) {
      if (this.adapters.has(candidate.route)) fail("invalid_input");
      this.adapters.set(candidate.route, candidate);
    }
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
  private routeKey(scope: AccountingScope) { return key(scope.tenantId, scope.companyId, scope.jobId); }
  private transport(scope: AccountingScope) {
    return this.adapters.get(this.routes.get(this.routeKey(scope)) ?? this.adapter.route)!;
  }
  previewRouteChange(ctx: Context, input: unknown, route: AccountingRoute, now: number) {
    const scope = parseAccounting(accountingScopeV1, input);
    const consent = this.authorize(ctx, scope, now);
    if (scope.mapping.tenantId !== scope.tenantId || scope.mapping.companyId !== scope.companyId) fail("reference_conflict");
    const source = this.sources.get(key(scope.tenantId, scope.sourceId));
    if (!source || source.jobId !== scope.jobId || source.revision !== scope.sourceRevision) fail("source_unavailable");
    const target = this.adapters.get(route);
    if (!target) fail("unsupported_mapping");
    const connectionRevision = target.assertConnection(scope.tenantId, scope.companyId);
    const entries = [...this.entries.values()].filter(e => e.tenantId === scope.tenantId && e.companyId === scope.companyId && e.jobId === scope.jobId);
    if (entries.some(e => e.status !== "pushed")) fail("reconcile_required");
    // Both routes must see the same historic target; a switch cannot hide an edit or an absent object.
    for (const entry of entries) {
      for (const adapter of [this.transport(scope), target]) {
        const matches = adapter.find(entry.reference, scope);
        const found = matches[0];
        if (matches.length !== 1 || !found || found.id !== entry.externalId || found.contentHash !== entry.contentHash ||
            hash(found.payload) !== hash(this.artifacts.get(key(entry.tenantId, entry.companyId, entry.sourceId))?.target)) fail("reconcile_required");
      }
    }
    const artifact = { version: 1, scope, from: this.transport(scope).route, to: route, connectionRevision,
      consentRevision: consent.revision, entries };
    return structuredClone({ artifact, previewHash: hash(artifact) });
  }
  confirmRouteChange(ctx: Context, input: unknown, route: AccountingRoute, decisionInput: unknown, now: number) {
    const preview = this.previewRouteChange(ctx, input, route, now);
    const decision = parseAccounting(accountingRouteDecisionV1, decisionInput);
    if (decision.tenantId !== ctx.tenantId || decision.actorId !== ctx.actorId || decision.expiresAt <= now ||
        decision.previewHash !== preview.previewHash) fail("approval_required");
    const decisionKey = key(ctx.tenantId, decision.decisionId);
    if (this.decisions.has(decisionKey)) fail("replay_conflict");
    this.decisions.set(decisionKey, hash(decision));
    this.routes.set(this.routeKey(preview.artifact.scope), route);
    this.routeChanges.push({ scope: preview.artifact.scope, from: preview.artifact.from, to: route,
      previewHash: preview.previewHash, decisionId: decision.decisionId });
  }
  routeHistory(ctx: Context, input: unknown, now: number) {
    const scope = parseAccounting(accountingScopeV1, input);
    this.authorize(ctx, scope, now);
    return structuredClone(this.routeChanges.filter(change => this.routeKey(change.scope) === this.routeKey(scope)));
  }
  preview(ctx: Context, input: unknown, now: number) {
    const scope = parseAccounting(accountingScopeV1, input);
    const consent = this.authorize(ctx, scope, now);
    if (scope.mapping.tenantId !== scope.tenantId || scope.mapping.companyId !== scope.companyId) fail("reference_conflict");
    const adapter = this.transport(scope);
    const connectionRevision = adapter.assertConnection(scope.tenantId, scope.companyId);
    const source = this.sources.get(key(scope.tenantId, scope.sourceId));
    if (!source || source.jobId !== scope.jobId || source.revision !== scope.sourceRevision ||
      (source.kind === "customer_invoice" ? source.state !== "issued" : source.state !== "posted")) fail("source_unavailable");
    if (source.finalAccount && source.finalAccount.revision !== source.finalAccount.lockedRevision) fail("source_unavailable");
    if (source.kind === "customer_invoice" ? source.invoiceId !== null || source.invoiceRevision !== null : source.invoiceId === null || source.invoiceRevision === null) fail("reference_conflict");
    if (source.invoiceId) {
      const invoice = this.sources.get(key(scope.tenantId, source.invoiceId));
      if (!invoice || invoice.revision !== source.invoiceRevision || (invoice.finalAccount && invoice.finalAccount.revision !== invoice.finalAccount.lockedRevision) || invoice.jobId !== scope.jobId || invoice.kind !== "customer_invoice" || invoice.state !== "issued" ||
        source.amount.pence > invoice.amount.pence) fail("reference_conflict");
      const allocated = [...this.entries.values()].filter(e => e.tenantId === scope.tenantId && e.invoiceId === source.invoiceId)
        .filter(e => !(e.companyId === scope.companyId && e.sourceId === source.sourceId))
        .reduce((sum, e) => sum + BigInt(e.pence), 0n);
      if (allocated + BigInt(source.amount.pence) > BigInt(invoice.amount.pence)) fail("reference_conflict");
    }
    if (source.tax !== scope.mapping.tax || (adapter.route === "xero" && source.tax === "unsupported")) fail("unsupported_mapping");
    const target = parseAccounting(accountingTargetV1, {
      version: 1, companyId: scope.companyId,
      objectType: { customer_invoice: "invoice", credit: "credit_note", receipt: "payment" }[source.kind],
      sourceId: source.sourceId, sourceRevision: source.revision, invoiceId: source.invoiceId, invoiceRevision: source.invoiceRevision,
      amount: source.amount, accountId: scope.mapping.accountId, customerId: scope.mapping.customerId,
      tax: source.tax, retention: source.retention, cis: source.cis, drc: source.drc,
    });
    const artifact = { version: 1, direction: "push", route: adapter.route, connectionRevision, scope, source, consentRevision: consent.revision,
      target };
    return structuredClone({ artifact, previewHash: hash(artifact), warning: "Synthetic only; fixture tax codes; unsupported retention/CIS/DRC; no settlement proof" });
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
    const original = this.artifacts.get(effect);
    // Route/connection changes require fresh authorization, but never rewrite historic mappings or target IDs.
    if (original && hash({ scope: original.scope, source: original.source, target: original.target }) !==
        hash({ scope: preview.artifact.scope, source: preview.artifact.source, target: preview.artifact.target })) fail("reference_conflict");
    if ([...this.entries.values()].some(e => e.tenantId === scope.tenantId && e.sourceId === scope.sourceId && e.companyId !== scope.companyId)) fail("reference_conflict");
    const entry: Entry = existing ?? { tenantId: scope.tenantId, jobId: scope.jobId, companyId: scope.companyId,
      sourceId: scope.sourceId, sourceRevision: scope.sourceRevision, mappingRevision: scope.mapping.revision,
      kind: preview.artifact.source.kind, invoiceId: preview.artifact.source.invoiceId, pence: preview.artifact.source.amount.pence,
      reference: hash(effect), contentHash: preview.previewHash, status: "pending", externalId: null, attempts: 0, retryAt: null, qualifyingRecoveryProof: false };
    for (const replayKey of replayKeys) this.commands.set(replayKey, { fingerprint, effect });
    this.entries.set(effect, entry);
    if (!original) this.artifacts.set(effect, structuredClone(preview.artifact));
    if (entry.status === "pushed") return structuredClone(entry);
    if (entry.status === "rate_limited") {
      if (entry.retryAt === null || now < entry.retryAt) fail("rate_limited");
      entry.status = "confirmed_absent";
    }
    if (entry.status !== "pending" && entry.status !== "confirmed_absent") fail("reconcile_required");
    // Always reconcile before create, even on the first attempt (e.g. a prior import).
    const adapter = this.transport(scope);
    if (adapter.find(entry.reference, scope).length) return this.reconcile(ctx, scope, now);
    entry.attempts++;
    try {
      const result = adapter.push(entry.reference, entry.contentHash, preview.artifact.target, scope);
      entry.externalId = result.id; entry.status = "pushed"; entry.retryAt = null;
    } catch (error) {
      if (error instanceof FakeRateLimit) {
        entry.status = "rate_limited"; entry.retryAt = now + error.retryAfter;
      } else entry.status = error instanceof Error && error.message === "reject" ? "failed" : "outcome_unknown";
    }
    this.audit.push({ tenantId: ctx.tenantId, reference: entry.reference, status: entry.status });
    return structuredClone(entry);
  }
  reconcile(ctx: Context, input: unknown, now: number): Entry {
    const scope = parseAccounting(accountingScopeV1, input);
    this.authorize(ctx, scope, now);
    const entry = this.entries.get(key(scope.tenantId, scope.companyId, scope.sourceId));
    if (!entry || entry.jobId !== scope.jobId || entry.sourceRevision !== scope.sourceRevision) fail("source_unavailable");
    const adapter = this.transport(scope);
    adapter.assertConnection(scope.tenantId, scope.companyId);
    if (entry.status === "rate_limited" && entry.retryAt !== null && now < entry.retryAt) fail("rate_limited");
    const matches = adapter.find(entry.reference, scope);
    if (matches.length > 1) entry.status = "duplicate_import";
    else if (matches.length === 0) entry.status = entry.externalId ? "reference_conflict" : "confirmed_absent";
    else {
      const found = matches[0]!;
      if (entry.externalId && entry.externalId !== found.id) entry.status = "reference_conflict";
      else if (entry.contentHash !== found.contentHash ||
        hash(this.artifacts.get(key(scope.tenantId, scope.companyId, scope.sourceId))?.target) !== hash(found.payload)) entry.status = "external_edit";
      else { entry.externalId = found.id; entry.status = "pushed"; entry.retryAt = null; }
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
