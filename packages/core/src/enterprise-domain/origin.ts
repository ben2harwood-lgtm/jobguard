import { z } from "zod";
import { compareExactPence, exactPence, parseExactPence, sumExactPence, type ExactPence } from "../cumulative-fee.js";
import { compareServerInstants, covers, enterpriseActorV1, enterpriseExtraV1, parseEnterpriseGroup, readEnterprise, refuse,
  type EnterpriseActor, type EnterpriseExtra, type EnterpriseGroup } from "./contracts.js";

const senior = ["supervisor", "surveyor", "commercial_manager"] as const;
const billedStates = ["billed", "part_paid", "paid"] as const;
export function assertDuplicateGroup(raw: unknown): void {
  const g = parseEnterpriseGroup(raw), byId = new Map(g.members.map(e => [e.id, e]));
  const canonical = byId.get(g.canonicalId)!;
  if (canonical.duplicateOf !== null || canonical.state === "duplicate" || g.members.filter(e => e.duplicateOf === null).length !== 1) return refuse("INVALID_DUPLICATE_GROUP");
  for (const e of g.members) {
    if (e.id === canonical.id) continue;
    // Links target the one non-duplicate canonical, rather than arbitrary chains.
    if (e.state !== "duplicate" || e.duplicateOf !== canonical.id || e.duplicateOf === e.id) return refuse("INVALID_DUPLICATE_GROUP");
  }
}
export function effectiveOrigin(raw: unknown): EnterpriseExtra {
  const g = parseEnterpriseGroup(raw); assertDuplicateGroup(g);
  return [...g.members].sort((a, b) => compareServerInstants(a.origin.serverRecordedAt, b.origin.serverRecordedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!;
}
export function captureSatisfied(e: EnterpriseExtra): boolean {
  return ((e.captureNote !== null && e.captureNote.trim().length > 0) || (e.photo.status === "verified" && e.photo.evidenceId !== null && e.photo.hash !== null && e.photo.tenantId === e.tenantId && e.photo.jobId === e.jobId && e.photo.scopeItemId === e.scopeItemId && e.photo.objectVersionId !== null)) &&
    (!e.residentCaptured || e.residentConfirmationHash !== null);
}
export function siteOriginated(raw: unknown): boolean {
  const g = parseEnterpriseGroup(raw), e = effectiveOrigin(g), kind = e.origin.origin.kind;
  if (g.jobTrack !== "contractor" || !["site_user", "jobguard_surfaced_confirmed"].includes(kind) || e.orderAtOrigin.coverage === "fully_instructed" || !captureSatisfied(e)) return false;
  if (kind === "site_user") return ["operative", "supervisor"].includes(e.raisingCommand.role) && e.raisingCommand.assigned;
  const p = e.prompt;
  return p !== null && p.confirmedBy.membershipId === e.origin.raisingMembershipId && covers(p.confirmedBy, e, senior) &&
    g.members.every(member => compareServerInstants(p.surfacedAt, member.origin.serverRecordedAt) < 0);
}
/** Ordered steps stay bound to the supplied immutable requirement/revision. */
export function approvalSnapshotValid(e: EnterpriseExtra, complete = true): boolean {
  const r = e.revision, requirement = r.requirement;
  if (!r.priceConfirmed || r.netPence === null || r.netPence <= 0 || r.priceSource === "unpriced" || !requirement ||
    r.approvals.length > requirement.steps.length || (complete && r.approvals.length !== requirement.steps.length)) return false;
  if (requirement.photoRequired && (e.photo.status !== "verified" || !e.photo.evidenceId || !e.photo.hash || e.photo.tenantId !== e.tenantId || e.photo.jobId !== e.jobId || e.photo.scopeItemId !== e.scopeItemId || !e.photo.objectVersionId)) return false;
  if ((requirement.residentRequired || e.residentCaptured) && !e.residentConfirmationHash) return false;
  const actors = new Set<string>();
  for (const [index, step] of r.approvals.entries()) {
    const required = requirement.steps[index]!;
    if (step.index !== index || step.revisionId !== r.id || step.hash !== r.hash || step.netPence !== r.netPence || step.ruleVersion !== requirement.ruleVersion ||
      step.actorId === e.origin.raisingMembershipId || actors.has(step.actorId)) return false;
    if (required.role === "contract_rule") {
      if (requirement.steps.length !== 1 || step.role !== "contract_rule" || step.grant !== null) return false;
    } else if (!step.grant || step.grant.tenantId !== e.tenantId || step.grant.jobId !== e.jobId || step.grant.role !== step.role || step.grant.membershipId !== step.actorId ||
      !(step.role === required.role || required.alternates.includes(step.role as typeof required.alternates[number]))) return false;
    actors.add(step.actorId);
  }
  return true;
}
export function qualifyingPrincipal(raw: unknown, options: { reference?: boolean; recordedCutoff?: string } = {}): ExactPence {
  const g = parseEnterpriseGroup(raw); assertDuplicateGroup(g);
  const zero = exactPence(0n), e = g.members.find(m => m.id === g.canonicalId)!;
  if ((!options.reference && (g.mode !== "production_billing" || !g.feeGate)) || !siteOriginated(g) || !billedStates.includes(e.state as typeof billedStates[number]) ||
    !e.exportLineId || e.exportedAt === null || g.unresolvedCandidateIds.length > 0 || !approvalSnapshotValid(e)) return zero;
  try {
    if (options.recordedCutoff !== undefined && (compareServerInstants(e.revision.serverRecordedAt, options.recordedCutoff) >= 0 ||
      e.revision.approvals.some(a => compareServerInstants(a.serverRecordedAt, options.recordedCutoff!) >= 0) || e.exportedAt === null || compareServerInstants(e.exportedAt, options.recordedCutoff) >= 0)) return zero;
    const facts = e.billingFacts.filter(f => f.status === "finalized" && (options.recordedCutoff === undefined || compareServerInstants(f.recordedAt, options.recordedCutoff) < 0));
    if (new Set(facts.map(f => JSON.stringify([f.kind, f.sourceRef, f.invoiceId, f.invoiceLineId]))).size !== facts.length) return refuse("INVALID_ENTERPRISE_FACTS");
    for (const fact of facts) {
      if (parseExactPence(fact.net).numerator < 0n) return refuse("INVALID_ENTERPRISE_FACTS");
      if ((fact.kind === "settled" || fact.kind === "credited") && !facts.some(f => f.kind === "invoiced" && f.invoiceId === fact.invoiceId && f.invoiceLineId === fact.invoiceLineId)) return refuse("INVALID_ALLOCATION");
      if (fact.kind === "reversed" && !facts.some(f => f.kind === "settled" && f.sourceRef === fact.originalSourceRef && f.invoiceId === fact.invoiceId && f.invoiceLineId === fact.invoiceLineId)) return refuse("INVALID_ALLOCATION");
    }
    const total = (positive: string, negative: string) => sumExactPence(facts.filter(f => f.kind === positive || f.kind === negative).map(f => {
      const p = parseExactPence(f.net); return exactPence(f.kind === negative ? -p.numerator : p.numerator, p.denominator);
    }));
    const invoiced = total("invoiced", "credited"), paid = total("settled", "reversed"), approved = exactPence(BigInt(e.revision.netPence!));
    const least = [approved, invoiced, paid].reduce((a, b) => compareExactPence(a, b) < 0 ? a : b);
    return compareExactPence(least, zero) < 0 ? zero : least;
  } catch (error) {
    if (error instanceof Error && error.name === "EnterpriseDomainError") throw error;
    return refuse("MONEY_LIMIT");
  }
}
export function feeBearing(raw: unknown): boolean { return qualifyingPrincipal(raw).numerator > 0n; }
export function assertOriginUnchanged(before: EnterpriseExtra, after: EnterpriseExtra): void {
  const a = readEnterprise(enterpriseExtraV1, before), b = readEnterprise(enterpriseExtraV1, after);
  if (a.id !== b.id || a.tenantId !== b.tenantId || a.jobId !== b.jobId || a.scopeItemId !== b.scopeItemId ||
    JSON.stringify(a.origin) !== JSON.stringify(b.origin) || JSON.stringify(a.raisingCommand) !== JSON.stringify(b.raisingCommand) || JSON.stringify(a.orderAtOrigin) !== JSON.stringify(b.orderAtOrigin)) return refuse("INVALID_ORIGIN");
}
const reconciliationAuthorizationV1 = z.object({ version: z.literal("enterprise-reconciliation-authorization.v1"), decisionId: z.string().uuid(),
  action: z.literal("ReconcileExportedDuplicate"), tenantId: z.string().uuid(), jobId: z.string().uuid(), canonicalId: z.string().uuid(), actorId: z.string().uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u), resolution: z.enum(["approved", "rejected", "dismissed"]), current: z.boolean(), expired: z.boolean(),
}).strict();
const repairV1 = z.object({ kind: z.enum(["unlink", "reconcile"]), reason: z.string().trim().min(1).max(300), reconciliationId: z.string().uuid().nullable(), inputFactsHash: z.string().regex(/^[a-f0-9]{64}$/u), authorization: reconciliationAuthorizationV1.nullable() }).strict();
export function assertDuplicateRepair(raw: unknown, suppliedActor: EnterpriseActor, rawRepair: unknown): void {
  const g = parseEnterpriseGroup(raw); assertDuplicateGroup(g);
  const actor = readEnterprise(enterpriseActorV1, suppliedActor), repair = readEnterprise(repairV1, rawRepair), exported = g.members.some(e => e.exportLineId !== null);
  if (repair.kind === "unlink") {
    if (exported || !covers(actor, g, senior)) return refuse("PERMISSION_DENIED");
  } else {
    const a = repair.authorization;
    if (!exported || !a || !repair.reconciliationId || !covers(actor, g, ["finance", "commercial_manager"]) || a.resolution !== "approved" || !a.current || a.expired ||
      a.tenantId !== g.tenantId || a.jobId !== g.jobId || a.canonicalId !== g.canonicalId || a.actorId !== actor.membershipId || a.contentHash !== repair.inputFactsHash) return refuse("PERMISSION_DENIED");
  }
}
const coalesceV1 = z.object({ tenantId: z.string().uuid(), jobId: z.string().uuid(), matchingExtraId: z.string().uuid() }).strict();
export function coalescePrompt(raw: unknown, matching: unknown): Readonly<{ canonicalId: string; createsOrigin: false }> {
  const g = parseEnterpriseGroup(raw); assertDuplicateGroup(g); const match = readEnterprise(coalesceV1, matching);
  if (match.tenantId !== g.tenantId || match.jobId !== g.jobId || !g.members.some(e => e.id === match.matchingExtraId)) return refuse("INVALID_DUPLICATE_GROUP");
  return Object.freeze({ canonicalId: g.canonicalId, createsOrigin: false });
}
