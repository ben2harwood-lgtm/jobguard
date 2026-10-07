import { z } from "zod";
import { sha256 } from "../evidence-pack.js";
import { instantV1 } from "../receipt-allocation.js";
import { shadowCaptureV1 } from "./capture.js";
import { freezeShadow, parseShadow, shadowAmount, ShadowDomainError, shadowId, shadowRef, uniqueShadowIds } from "./types.js";
export const shadowLockV1 = z.object({ version: z.literal("shadow-lock.v1"), tenantId: shadowId, jobId: shadowId, finalAccountRevisionId: shadowId, baselineQuoteVersionId: shadowId, captureRegister: z.array(shadowCaptureV1).readonly(), lines: z.array(z.object({ id: shadowId, scopeItemId: shadowId, revisionId: shadowId, netPence: shadowAmount, sourceRef: shadowRef }).strict().readonly()).readonly(), scopeDispositions: z.array(z.object({ scopeItemId: shadowId, disposition: z.enum(["done", "removed", "deferred"]), sourceRef: shadowRef }).strict().readonly()).readonly(), baselineScopeItemIds: z.array(shadowId).readonly(), declaration: z.string().min(1).max(4000), declarationVersion: shadowRef, onboardingTermsVersion: shadowRef, lockingMembershipId: shadowId, serverTimestamp: instantV1, commandId: shadowId, auditEventId: shadowId }).strict().readonly();
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Canonical v1: lexicographic object keys, JSON string encoding, set arrays sorted by their stable IDs. */
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (typeof value === "object" && value !== null)
        return `{${Object.entries(value).sort(([a], [b]) => order(a, b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
    return JSON.stringify(value);
}
export function createLockSnapshot(raw: unknown) {
    const s = parseShadow(shadowLockV1, raw);
    uniqueShadowIds(s.captureRegister.map(c => c.id));
    uniqueShadowIds(s.lines.map(l => l.id));
    uniqueShadowIds(s.scopeDispositions.map(d => d.scopeItemId));
    uniqueShadowIds(s.baselineScopeItemIds);
    if (s.captureRegister.some(c => c.tenantId !== s.tenantId || c.jobId !== s.jobId || c.recordedPhase !== "pre_lock") || s.scopeDispositions.length !== s.baselineScopeItemIds.length || s.scopeDispositions.some(d => !s.baselineScopeItemIds.includes(d.scopeItemId)))
        throw new ShadowDomainError("SOURCE_BINDING_MISMATCH");
    const snapshot = freezeShadow({ ...s, captureRegister: [...s.captureRegister].sort((a, b) => order(a.id, b.id)), lines: [...s.lines].sort((a, b) => order(a.id, b.id)), scopeDispositions: [...s.scopeDispositions].sort((a, b) => order(a.scopeItemId, b.scopeItemId)), baselineScopeItemIds: [...s.baselineScopeItemIds].sort(order) });
    const canonicalBytes = canonical(snapshot);
    return freezeShadow({ version: "shadow-lock-digest.v1" as const, snapshot, canonicalBytes, digest: sha256(canonicalBytes) });
}
