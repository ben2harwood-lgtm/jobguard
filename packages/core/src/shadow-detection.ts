import { sha256 } from "./evidence-pack.js";
import { parseObservation, ObservationError, type Observation } from "./observation.js";
import { matchBuilderCapture, shadowCaptureV1, type ShadowCapture } from "./shadow-domain/capture.js";
import { evaluateMustSurface } from "./shadow-domain/must-surface.js";
import { coalesceShadowSignals, createShadowSignal, transitionShadowSignal, type ShadowSignal } from "./shadow-domain/signal.js";
import { shadowProposalV1, type ShadowProposal } from "./shadow-domain/types.js";
export const SHADOW_DETECTOR_VERSION = "shadow-deterministic.v1";
/** Stable UUID derived from a length-delimited, versioned identity. No clock or model score. */
export function shadowDetectionId(parts: readonly string[]): string {
  const h = sha256(JSON.stringify(["shadow-detection-id.v1", ...parts])).slice(0, 32).split("");
  h[12] = "4"; h[16] = "8"; const v = h.join("");
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}
export function observationMustSurface(o: Observation) {
  const f = o.facts;
  return evaluateMustSurface({ version: "shadow-must-surface.v1", policyVersion: "shadow_attribution_policy_v3",
    safetyImplication: f.safetyImplication, customerClearlyRequested: f.customerClearlyRequested, needsPriorWrittenAgreement: f.needsPriorWrittenAgreement,
    ...(f.significantWork ? { significantWork: { version: "D13-significance.v1", ...f.significantWork } } : {}),
    activeDispute: f.activeDispute, silenceMateriallyWorsensDispute: f.silenceMateriallyWorsensDispute, disclosureDuty: f.disclosureDuty, sourceRef: o.evidence.id });
}
export function matchObservationCapture(o: Observation, captures: readonly ShadowCapture[]) {
  return matchBuilderCapture({ version: "shadow-match.v1", tenantId: o.tenantId, jobId: o.jobId, scopeArea: o.facts.scopeArea,
    description: o.facts.description, dateCompatibility: "unknown", valueCompatibility: "unknown", ruleVersion: "builder-favourable-match.v1" }, captures);
}
/** Only structured facts affect detection. Free text, including instructions, remains cited data. */
export function proposalFromObservation(o: Observation, kind: "deterministic" | "ai_proposal", version: string, at: string, timing: { lock: "before_lock" | "after_lock"; adoption: "before_adoption" | "after_adoption" }): ShadowProposal {
  const workId = shadowDetectionId([o.tenantId, o.jobId, "work", o.facts.scopeArea, o.facts.workReference]);
  const signalId = shadowDetectionId([o.tenantId, o.jobId, workId, kind, version, o.evidence.id, o.evidence.objectVersionId]);
  return shadowProposalV1.parse({ version: "shadow-proposal.v1", tenantId: o.tenantId, jobId: o.jobId, workId, signalId,
    signalType: "possible_extra", detectorKind: kind, detectorVersion: version, createdAt: at, evidenceCutoffAt: o.evidence.serverReceivedAt,
    description: o.facts.description, estimatedValuePence: o.facts.estimatedValuePence, confidenceBand: "low", mustSurfaceNow: false,
    evidence: [{ version: "shadow-evidence.v1", tenantId: o.tenantId, jobId: o.jobId, workId, signalId, evidenceId: o.evidence.id,
      objectVersionId: o.evidence.objectVersionId, sha256: o.evidence.sha256, sourceReceivedAt: o.evidence.serverReceivedAt, lockTiming: timing.lock, adoptionTiming: timing.adoption }] });
}
export function detectShadowObservations(raw: readonly unknown[], capturesRaw: readonly ShadowCapture[], at: string): readonly ShadowProposal[] {
  const captures = capturesRaw.map(c => shadowCaptureV1.parse(c));
  return raw.map(parseObservation).filter(o => {
    const fired = observationMustSurface(o).firedRules.length > 0;
    const candidate = ["supplier_line", "purchase_order_line"].includes(o.kind)
      ? ["completed", "requested", "unknown"].includes(o.facts.status) : o.facts.status === "completed" || o.facts.status === "requested";
    return fired || (candidate && matchObservationCapture(o, captures).outcome === "unmatched");
  }).map(o => proposalFromObservation(o, "deterministic", SHADOW_DETECTOR_VERSION, at, { lock: "before_lock", adoption: "after_adoption" }));
}
export type DetectionGroup = Readonly<{ primary: ShadowSignal; duplicates: readonly ShadowSignal[]; observations: readonly Observation[]; match: ReturnType<typeof matchBuilderCapture>; firings: ReturnType<typeof observationMustSurface>["firedRules"] }>;
/** SV-1 owns all coalescing and state transitions; groups supply explicit same-work facts. */
export function groupShadowProposals(proposals: readonly ShadowProposal[], observationsRaw: readonly unknown[], captures: readonly ShadowCapture[]): readonly DetectionGroup[] {
  const observations = observationsRaw.map(parseObservation), groups = new Map<string, ShadowProposal[]>();
  for (const p of proposals) {
    const o = observations.find(o => o.tenantId === p.tenantId && o.jobId === p.jobId && o.evidence.id === p.evidence[0]?.evidenceId);
    if (!o) throw new ObservationError("OBSERVATION_BINDING_MISMATCH");
    if (p.workId !== shadowDetectionId([o.tenantId,o.jobId,"work",o.facts.scopeArea,o.facts.workReference]) || p.evidence.some(e => !observations.some(source =>
      source.tenantId===e.tenantId && source.jobId===e.jobId && source.evidence.id===e.evidenceId && source.evidence.objectVersionId===e.objectVersionId && source.evidence.sha256===e.sha256 && source.evidence.serverReceivedAt===e.sourceReceivedAt)))
      throw new ObservationError("OBSERVATION_BINDING_MISMATCH");
    const list = groups.get(p.workId) ?? [], prior = list.find(v=>v.signalId===p.signalId);
    if (prior && JSON.stringify(prior)!==JSON.stringify(p)) throw new ObservationError("OBSERVATION_BINDING_MISMATCH");
    if (!prior) list.push(p); groups.set(p.workId, list);
  }
  return [...groups.values()].map(ps => {
    ps.sort((a, b) => a.signalId.localeCompare(b.signalId));
    const make = (p: ShadowProposal) => createShadowSignal(p, { version: "shadow-phase.v1", phase: "pre_lock", lockId: null }, p.evidence);
    let primary = make(ps[0]!); const duplicates: ShadowSignal[] = [];
    for (const p of ps.slice(1)) {
      const result = coalesceShadowSignals(primary, make(p), { version: "shadow-coalescing.v1", tenantId: primary.tenantId, jobId: primary.jobId,
        workId: primary.workId, sameWork: true, sourceRef: p.evidence[0]!.evidenceId, expectedPrimaryRevision: primary.revision, expectedDuplicateRevision: 0 });
      primary = result.primary; duplicates.push(result.duplicate);
    }
    primary = transitionShadowSignal(primary, { version: "shadow-event.v1", type: "hold", tenantId: primary.tenantId, jobId: primary.jobId,
      workId: primary.workId, signalId: primary.signalId, expectedRevision: primary.revision, phase: "pre_lock", lockId: null, at: primary.createdAt,
      sourceRef: primary.evidence[0]!.evidenceId }, { lockedLineIds: [], baselineItemIds: [] });
    const sources = observations.filter(o => o.tenantId === primary.tenantId && o.jobId === primary.jobId && primary.evidence.some(e => e.evidenceId === o.evidence.id));
    const matches = sources.map(o=>matchObservationCapture(o,captures));
    const match = matches.find(m=>m.outcome==="already_in_original_scope") ?? matches.find(m=>m.outcome==="builder_captured") ?? matches[0]!;
    const firings = sources.flatMap(o => observationMustSurface(o).firedRules);
    return { primary, duplicates, observations: sources, match, firings };
  });
}
