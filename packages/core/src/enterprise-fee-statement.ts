import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { calculateCumulativeFee, exactPenceV1, serializeExactPence } from "./cumulative-fee.js";
import { instantV1 } from "./receipt-allocation.js";
import { enterpriseGroupV1, enterpriseModeV1, enterpriseStatementV1, compareServerInstants } from "./enterprise-domain/contracts.js";
import { deriveEnterpriseReferenceStatement } from "./enterprise-domain/fee.js";

const uuid = z.guid({ error: "Invalid uuid" });
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const text = z.string().min(1).max(300);
const signedPence = z.number().int().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE);
const magnitude = z.number().int().min(0).max(MAX_MONEY_PENCE);
const period = z.string().regex(/^[2-9]\d{3}-(?:0[1-9]|1[0-2])$/u).refine(v => !v.startsWith("9999-"));
const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;
export const enterpriseFeeErrorCodes = ["INVALID_FEE_INPUT", "EXTRA_FORBIDDEN", "JOB_NOT_LIVE", "FEE_NOT_FOUND",
  "COMMAND_CONFLICT", "STALE_FACTS", "TRACE_REQUIRED", "STATEMENT_AUTHORITY_INVALID", "MIXED_SIGN_HELD",
  "STATEMENT_EXECUTION_HELD", "FEE_GATE_CLOSED", "SYNTHETIC_REFERENCE_FORBIDDEN", "OUTCOME_UNKNOWN"] as const;
export class EnterpriseFeeError extends Error {
  constructor(public readonly code: typeof enterpriseFeeErrorCodes[number]) { super(code); this.name = "EnterpriseFeeError"; }
}
export const enterpriseFeeErrorV1 = z.object({ version: z.literal("enterprise-fee-error.v1"), code: z.enum(enterpriseFeeErrorCodes) }).strict();
export function enterpriseFeePublicError(error: EnterpriseFeeError) {
  const status = error.code === "EXTRA_FORBIDDEN" || error.code === "STATEMENT_AUTHORITY_INVALID" ? 403
    : error.code === "FEE_NOT_FOUND" ? 404 : error.code === "INVALID_FEE_INPUT" ? 400 : 409;
  return Object.freeze({ status, body: Object.freeze({ version: "enterprise-fee-error.v1" as const, code: error.code }) });
}
export function parseEnterpriseFee<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
  return result.data;
}

/** Future command data only. There is deliberately no executable tenant/month boundary. */
const revisionCommand = { commandId: uuid, statementId: uuid, revisionId: uuid, expectedStatementHash: hash };
export const enterpriseFeeCommandV1 = z.discriminatedUnion("action", [
  z.object({ version: z.literal("enterprise-fee-command.v1"), action: z.literal("derive"), commandId: uuid, period }).strict(),
  z.object({ version: z.literal("enterprise-fee-command.v1"), action: z.literal("dispute"), ...revisionCommand,
    lineIds: z.array(uuid).min(1).max(10000).refine(unique), reasonCode: z.enum(["origin", "duplicate", "amount", "allocation", "other"]),
    explanation: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ version: z.literal("enterprise-fee-command.v1"), action: z.literal("approve"), ...revisionCommand }).strict(),
  z.object({ version: z.literal("enterprise-fee-command.v1"), action: z.literal("post-reference"), ...revisionCommand, approvalId: uuid }).strict(),
  z.object({ version: z.literal("enterprise-fee-command.v1"), action: z.literal("invoice-simulation"), ...revisionCommand, approvalId: uuid }).strict(),
]);
export const enterpriseFeeReconciliationV1 = z.object({ version: z.literal("enterprise-exported-duplicate.v1"), commandId: uuid,
  jobId: uuid, canonicalId: uuid, memberIds: z.array(uuid).min(2).max(10000), inputFactsHash: hash,
  correctionManifestHash: hash, decisionId: uuid, authorizationId: uuid, reasonCode: z.literal("duplicate_work"),
}).strict().refine(v => unique(v.memberIds) && v.memberIds.includes(v.canonicalId), "Invalid member identity");
export const enterpriseFeeListV1 = z.object({ version: z.literal("enterprise-fee-list.v1"), period: period.optional(),
  afterStatementId: uuid.optional(), limit: z.number().int().min(1).max(100).prefault(25) }).strict();
export const enterpriseFeeReadV1 = z.object({ version: z.literal("enterprise-fee-read.v1"), statementId: uuid,
  revision: z.number().int().min(1).max(1_000_000).optional() }).strict();

/** A representation of supported reference terms, never permission to record an agreement. */
export const enterpriseFeeAgreementV1 = z.object({ version: z.literal("enterprise-fee-agreement.v1"), id: uuid, tenantId: uuid,
  agreementRef: text, rate: z.object({ numerator: z.string().regex(/^(?:0|[1-9]\d*)$/u).max(100),
    denominator: z.string().regex(/^[1-9]\d*$/u).max(100) }).strict(), basis: z.literal("on_payment"),
  effectiveFrom: instantV1, policyVersion: z.literal("enterprise_site_capture_policy_v1"), endOfJobCheck: z.boolean(),
  minimumCommitment: z.null(), onboardingFee: z.null(), volumeBands: z.null(), contentHash: hash,
  environment: enterpriseModeV1, operationsActorRef: text, recordedAt: instantV1,
}).strict().refine(v => /^(?:0|[1-9]\d*)$/u.test(v.rate.numerator) && /^[1-9]\d*$/u.test(v.rate.denominator) &&
  v.rate.numerator.length <= 100 && v.rate.denominator.length <= 100 && BigInt(v.rate.numerator) <= BigInt(v.rate.denominator), "Unsupported rate");

export const enterpriseFeeSourceV1 = z.object({ kind: z.enum(["origin", "capture", "evidence", "order", "revision", "requirement",
  "approval", "duplicate", "export", "invoice", "invoice_line", "receipt", "allocation", "credit", "reversal", "agreement", "prior_derivation", "prior_journal"]),
  id: text, tenantId: uuid, jobId: uuid.nullable(), hash, recordedAt: instantV1,
}).strict();
const referenceStatement = enterpriseStatementV1.omit({ inputFactsHash: true, feeGate: true }).extend({ mode: z.enum(["synthetic_demo", "pilot_no_charge"]) });
/** Supplied reference facts, NOT an authoritative fact adapter or a request body. */
export const enterpriseFeeReferenceInputV1 = z.object({ version: z.literal("enterprise-fee-reference-input.v1"),
  statement: referenceStatement, sources: z.array(enterpriseFeeSourceV1).max(100000),
}).strict().superRefine((v, ctx) => {
  if (!unique(v.sources.map(s => JSON.stringify([s.kind, s.id]))) || v.sources.some(s => s.tenantId !== v.statement.tenantId))
    ctx.addIssue({ code: "custom", message: "Source identity mismatch" });
  const groups = v.statement.groups;
  if (!unique(groups.map(g => g.canonicalId)) || groups.some(g => g.tenantId !== v.statement.tenantId || g.mode !== v.statement.mode || g.feeGate))
    ctx.addIssue({ code: "custom", message: "Reference group mismatch" });
});
export type EnterpriseFeeReferenceInput = z.infer<typeof enterpriseFeeReferenceInputV1>;

/** Month starts are unambiguous in London. Resolve them against the named IANA zone, rather than the host zone. */
function londonMidnight(year: number, month: number): string {
  const localDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const midnight = Date.parse(`${localDate}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const offset of [0, 3_600_000]) {
    const candidate = new Date(midnight - offset), parts = formatter.formatToParts(candidate);
    const field = (name: string) => parts.find(p => p.type === name)?.value;
    if (`${field("year")}-${field("month")}-${field("day")}` === localDate && field("hour") === "00" && field("minute") === "00")
      return candidate.toISOString().replace(".000Z", "Z");
  }
  throw new EnterpriseFeeError("INVALID_FEE_INPUT");
}
export function enterpriseFeeMonth(raw: unknown) {
  const value = parseEnterpriseFee(period, raw), year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7));
  return Object.freeze({ period: value, timeZone: "Europe/London" as const, start: londonMidnight(year, month),
    cutoff: londonMidnight(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1) });
}
export function enterpriseFeeRecordedBeforeCutoff(recordedAt: unknown, month: unknown): boolean {
  return compareServerInstants(parseEnterpriseFee(instantV1, recordedAt), enterpriseFeeMonth(month).cutoff) < 0;
}

const referenceLine = z.object({ extraId: uuid, currentPrincipal: exactPenceV1, priorPrincipal: exactPenceV1,
  principalChange: exactPenceV1, contributionChange: exactPenceV1, feePence: signedPence, trace: enterpriseGroupV1 }).strict();
const referenceSection = z.object({ agreementVersionId: text, qualifyingPrincipal: exactPenceV1, cumulativeFeePence: magnitude,
  priorNetPostedPence: magnitude, deltaPence: signedPence, priorDerivationId: uuid.nullable(),
  kind: z.enum(["proposal", "linked_compensation", "zero_result"]), compensatesDerivationId: uuid.nullable(),
  lines: z.array(referenceLine).max(10000), postingAuthorized: z.literal(false) }).strict();
export const enterpriseFeeReferenceArtifactV1 = z.object({ version: z.literal("enterprise-fee-reference-artifact.v1"), tenantId: uuid,
  statementId: uuid, period, timeZone: z.literal("Europe/London"), cutoff: instantV1,
  mode: z.enum(["synthetic_demo", "pilot_no_charge"]), label: z.enum(["Illustration — no charge", "Reference illustration — no charge"]),
  inputFactsHash: hash, totalPence: signedPence, currency: z.literal("GBP"), sections: z.array(referenceSection).max(100),
  referenceOnly: z.literal(true), postingAuthorized: z.literal(false) }).strict();
export type EnterpriseFeeReferenceArtifact = z.infer<typeof enterpriseFeeReferenceArtifactV1>;
export const enterpriseFeePreparedReferenceV1 = z.object({ version: z.literal("enterprise-fee-prepared-reference.v1"),
  manifest: enterpriseFeeReferenceInputV1, artifact: enterpriseFeeReferenceArtifactV1, inputFactsHash: hash, statementHash: hash }).strict();
export type EnterpriseFeePreparedReference = z.infer<typeof enterpriseFeePreparedReferenceV1>;
/** Data only. SQL identity, revision uniqueness and durable immutability remain blocked with persistence. */
export const enterpriseFeeStatementRevisionV1 = z.object({ version: z.literal("enterprise-fee-statement-revision.v1"),
  statementId: uuid, revisionId: uuid, revisionNumber: z.number().int().min(1).max(1_000_000), previousRevisionId: uuid.nullable(),
  prepared: enterpriseFeePreparedReferenceV1, serverRecordedAt: instantV1,
}).strict().refine(v => v.statementId === v.prepared.artifact.statementId && v.revisionId !== v.previousRevisionId &&
  (v.revisionNumber === 1 ? v.previousRevisionId === null : v.previousRevisionId !== null), "Revision identity mismatch");
/** Future unposted-dispute intent only: no revision is written or re-derived and no prior entitlement is changed. */
export const enterpriseFeeUnpostedDisputeV1 = z.object({ version: z.literal("enterprise-fee-unposted-dispute.v1"),
  commandId: uuid, statementId: uuid, sourceRevisionId: uuid, sourceStatementHash: hash, proposedRevisionId: uuid,
  excludedContributions: z.array(z.object({ agreementVersionId: text, extraId: uuid }).strict()).min(1).max(10000),
  reasonCode: z.enum(["origin", "duplicate", "amount", "allocation", "other"]), explanation: z.string().trim().min(1).max(2000),
  state: z.literal("unapproved"),
}).strict().refine(v => v.sourceRevisionId !== v.proposedRevisionId && unique(v.excludedContributions.map(l => JSON.stringify([l.agreementVersionId, l.extraId]))));

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Reuses the merged kernel. No persistence, journal, approval, allocation or production fee is created. */
export function representEnterpriseFeeReference(raw: unknown, suppliedInputFactsHash: unknown): EnterpriseFeeReferenceArtifact {
  const input = parseEnterpriseFee(enterpriseFeeReferenceInputV1, raw), inputFactsHash = parseEnterpriseFee(hash, suppliedInputFactsHash);
  const month = enterpriseFeeMonth(input.statement.period);
  if (compareServerInstants(input.statement.recordedCutoff, month.cutoff) !== 0) throw new EnterpriseFeeError("INVALID_FEE_INPUT");
  const result = deriveEnterpriseReferenceStatement({ ...input.statement, feeGate: false, inputFactsHash });
  for (const section of result.sections) {
    const agreement = input.statement.agreements.find(a => a.id === section.agreementVersionId);
    if (!agreement) throw new EnterpriseFeeError("STALE_FACTS");
    const prior = input.statement.prior.find(p => p.agreementVersionId === section.agreementVersionId);
    const kernel = calculateCumulativeFee({ version: "cumulative-fee.v1", rate: agreement.rate,
      cumulativeQualifyingPrincipal: serializeExactPence(section.qualifyingPrincipal), priorNetPostedPence: prior?.priorNetPostedPence ?? 0,
      priorPolicyVersion: prior?.priorPolicyVersion ?? section.agreementVersionId, compensatesDerivationId: prior?.derivationId ?? null });
    if (section.cumulativeFee.pence !== kernel.cumulativeFee.pence) throw new EnterpriseFeeError("STALE_FACTS");
  }
  const traces = new Map(input.statement.groups.map(g => [g.canonicalId, g]));
  const sections = result.sections.map(s => ({ agreementVersionId: s.agreementVersionId, qualifyingPrincipal: serializeExactPence(s.qualifyingPrincipal),
    cumulativeFeePence: s.cumulativeFee.pence, priorNetPostedPence: s.priorNetPostedFee.pence, deltaPence: s.postingDelta.pence,
    priorDerivationId: s.priorDerivationId, kind: s.kind, compensatesDerivationId: s.compensatesDerivationId, postingAuthorized: false as const,
    lines: s.lines.map(l => {
      const trace = traces.get(l.extraId);
      if (!trace || trace.agreementVersionId !== s.agreementVersionId) throw new EnterpriseFeeError("TRACE_REQUIRED");
      return { extraId: l.extraId, currentPrincipal: serializeExactPence(l.currentQualifyingPrincipal), priorPrincipal: serializeExactPence(l.priorQualifyingPrincipal),
        principalChange: serializeExactPence(l.qualifyingChange), contributionChange: serializeExactPence(l.contributionChange), feePence: l.fee.pence, trace };
    }) }));
  const totalPence = moneyFromBigInt(sections.reduce((sum, s) => sum + BigInt(s.deltaPence), 0n)).pence;
  return freeze(parseEnterpriseFee(enterpriseFeeReferenceArtifactV1, { version: "enterprise-fee-reference-artifact.v1", tenantId: result.tenantId,
    statementId: result.statementId, period: month.period, timeZone: month.timeZone, cutoff: month.cutoff, mode: input.statement.mode,
    label: result.label, inputFactsHash, totalPence, currency: "GBP", sections, referenceOnly: true, postingAuthorized: false }));
}

/** Signed sections are bound as data; the authorization column remains a nonnegative magnitude. Q-04 execution is held. */
export const enterpriseFeeSignedArtifactV1 = z.object({ version: z.literal("enterprise-fee-signed-artifact.v1"),
  action: z.enum(["post-reference", "invoice-simulation"]), tenantId: uuid, statementId: uuid, revisionId: uuid,
  statementHash: hash, inputFactsHash: hash, totalPence: signedPence, currency: z.literal("GBP"),
  sections: z.array(z.object({ agreementVersionId: text, agreementHash: hash, feePence: signedPence }).strict()).min(1).max(100),
  expiresAt: instantV1,
}).strict().refine(v => Number.isSafeInteger(v.totalPence) && Math.abs(v.totalPence) <= MAX_MONEY_PENCE &&
  v.sections.every(s => Number.isSafeInteger(s.feePence) && Math.abs(s.feePence) <= MAX_MONEY_PENCE) && unique(v.sections.map(s => s.agreementVersionId)) &&
  v.sections.reduce((sum, s) => sum + BigInt(s.feePence), 0n) === BigInt(v.totalPence), "Section total mismatch");
export const enterpriseFeeReferenceBindingRequestV1 = z.object({ version: z.literal("enterprise-fee-reference-binding.v1"),
  revisionId: uuid, action: z.enum(["post-reference", "invoice-simulation"]), expiresAt: instantV1 }).strict();
export const enterpriseFeeReferenceBindingV1 = z.object({ artifact: enterpriseFeeSignedArtifactV1, artifactHash: hash }).strict();
export const enterpriseFeeInvoiceWorkV1 = z.object({ version: z.literal("enterprise-fee-invoice-work.v1"), actionId: uuid,
  prepared: enterpriseFeePreparedReferenceV1, artifact: enterpriseFeeSignedArtifactV1, artifactHash: hash, authorizationId: uuid,
  outcome: z.enum(["not_started", "outcome_unknown"]) }).strict();
export const enterpriseFeeApprovalCheckV1 = z.object({ version: z.literal("enterprise-fee-approval-check.v1"),
  artifact: enterpriseFeeSignedArtifactV1, artifactHash: hash, now: instantV1,
  current: z.object({ tenantId: uuid, membershipId: uuid, grantId: uuid, role: text,
    sessionValid: z.boolean(), membershipActive: z.boolean(), grantActive: z.boolean() }).strict(),
  decision: z.object({ id: uuid, resolutionId: uuid, resolution: z.enum(["approved", "rejected", "dismissed"]), membershipId: uuid,
    artifactHash: hash, artifact: enterpriseFeeSignedArtifactV1, revoked: z.boolean(), superseded: z.boolean() }).strict(),
  authorization: z.object({ id: uuid, decisionId: uuid, resolutionId: uuid, membershipId: uuid, grantId: uuid, artifactHash: hash,
    artifact: enterpriseFeeSignedArtifactV1, amountPence: magnitude, currency: z.literal("GBP"), revoked: z.boolean() }).strict(),
}).strict();
export type EnterpriseFeeApprovalCheck = z.infer<typeof enterpriseFeeApprovalCheckV1>;
function sameArtifact(a: z.infer<typeof enterpriseFeeSignedArtifactV1>, b: z.infer<typeof enterpriseFeeSignedArtifactV1>): boolean {
  return a.version === b.version && a.action === b.action && a.tenantId === b.tenantId && a.statementId === b.statementId && a.revisionId === b.revisionId &&
    a.statementHash === b.statementHash && a.inputFactsHash === b.inputFactsHash && a.totalPence === b.totalPence && a.currency === b.currency &&
    a.expiresAt === b.expiresAt && a.sections.length === b.sections.length && a.sections.every((s, i) =>
      s.agreementVersionId === b.sections[i]!.agreementVersionId && s.agreementHash === b.sections[i]!.agreementHash && s.feePence === b.sections[i]!.feePence);
}
/** Validates supplied binding facts only; a future checked routine must independently load them under lock. */
export function assertEnterpriseFeeApprovalBinding(raw: unknown): void {
  const parsed = enterpriseFeeApprovalCheckV1.safeParse(raw);
  if (!parsed.success) throw new EnterpriseFeeError("STATEMENT_AUTHORITY_INVALID");
  const { artifact: a, current: c, decision: d, authorization: u, artifactHash, now } = parsed.data;
  if (a.sections.some(s => s.feePence > 0) && a.sections.some(s => s.feePence < 0)) throw new EnterpriseFeeError("MIXED_SIGN_HELD");
  const total = BigInt(a.totalPence), absolute = total < 0n ? -total : total;
  if (!c.sessionValid || !c.membershipActive || !c.grantActive || c.role !== "finance" || c.tenantId !== a.tenantId ||
    d.resolution !== "approved" || d.revoked || d.superseded || u.revoked || d.membershipId !== c.membershipId || u.membershipId !== c.membershipId ||
    u.grantId !== c.grantId || u.decisionId !== d.id || u.resolutionId !== d.resolutionId || u.artifactHash !== artifactHash || d.artifactHash !== artifactHash ||
    BigInt(u.amountPence) !== absolute || compareServerInstants(now, a.expiresAt) >= 0 || !sameArtifact(a, u.artifact) || !sameArtifact(a, d.artifact))
    throw new EnterpriseFeeError("STATEMENT_AUTHORITY_INVALID");
}

/** No policy record, caller flag, approved binding or practice artifact can open the held execution path. */
export function refuseEnterpriseFeeExecution(mode: z.infer<typeof enterpriseModeV1>, action: "accrue" | "collect" | "invoice-simulation"): never {
  parseEnterpriseFee(enterpriseModeV1, mode);
  parseEnterpriseFee(z.enum(["accrue", "collect", "invoice-simulation"]), action);
  throw new EnterpriseFeeError(mode === "synthetic_demo" ? "STATEMENT_EXECUTION_HELD" : "FEE_GATE_CLOSED");
}
