import { z } from "zod";
import { instantV1 } from "../receipt-allocation.js";
import { freezeShadow, parseShadow, shadowAmount, shadowId, shadowRef } from "./types.js";
export const captureStates = ["draft", "priced", "approved", "rejected", "withdrawn"] as const;
export const shadowSourceV1 = z.object({ version: z.literal("shadow-source.v1"), kind: z.enum(["baseline", "log_extra", "final_review", "diary", "voice_note", "photo", "supplier_document", "purchase_order", "message", "delivery_note", "imported_document"]), state: z.enum(captureStates).nullable(), aiStructured: z.boolean(), recordedPhase: z.enum(["pre_lock", "post_lock"]) }).strict().refine(v => v.kind === "log_extra" ? v.state !== null : v.state === null);
export function classifyShadowSource(raw: unknown): "capture" | "evidence" {
    const s = parseShadow(shadowSourceV1, raw);
    return s.kind === "baseline" || s.kind === "log_extra" || (s.kind === "final_review" && s.recordedPhase === "pre_lock") ? "capture" : "evidence";
}
export const shadowCaptureV1 = z.object({ version: z.literal("shadow-capture.v1"), tenantId: shadowId, jobId: shadowId, id: shadowId, scopeItemId: shadowId, revisionId: shadowId, serverRecordedAt: instantV1, valuePence: shadowAmount.nullable(), kind: z.enum(["baseline", "log_extra", "final_review"]), state: z.enum(captureStates).nullable(), scopeArea: shadowRef, description: z.string().min(1).max(4000), recordedPhase: z.enum(["pre_lock", "post_lock"]), aiStructured: z.boolean(), sourceRef: shadowRef }).strict().refine(v => v.kind === "log_extra" ? v.state !== null : v.state === null).readonly();
export type ShadowCapture = z.infer<typeof shadowCaptureV1>;
export const shadowMatchV1 = z.object({ version: z.literal("shadow-match.v1"), tenantId: shadowId, jobId: shadowId, scopeArea: shadowRef, description: z.string().min(1).max(4000), dateCompatibility: z.enum(["compatible", "incompatible", "unknown"]), valueCompatibility: z.enum(["compatible", "incompatible", "unknown"]), ruleVersion: z.literal("builder-favourable-match.v1") }).strict().readonly();
// Reversible reference normalization: NFKC, lower case, punctuation to spaces, whitespace trim.
// One common complete word is overlap. No score, date window, value tolerance or production threshold.
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function matchBuilderCapture(raw: unknown, capturesRaw: unknown): Readonly<{
    outcome: "builder_captured" | "already_in_original_scope" | "unmatched";
    ruleVersion: "builder-favourable-match.v1";
    references: readonly Readonly<{
        id: string;
        sourceRef: string;
    }>[];
}> {
    const s = parseShadow(shadowMatchV1, raw), captures = parseShadow(z.array(shadowCaptureV1).readonly(), capturesRaw), words = new Set(normalize(s.description).split(" ").filter(Boolean));
    const matches = captures.filter(c => c.tenantId === s.tenantId && c.jobId === s.jobId && c.recordedPhase === "pre_lock" && normalize(c.scopeArea) === normalize(s.scopeArea) && normalize(c.description).split(" ").some(w => w.length > 0 && words.has(w)) && s.dateCompatibility !== "incompatible" && s.valueCompatibility !== "incompatible");
    return freezeShadow({ outcome: matches.some(c => c.kind === "baseline") ? "already_in_original_scope" : matches.length ? "builder_captured" : "unmatched", ruleVersion: s.ruleVersion, references: matches.map(c => ({ id: c.id, sourceRef: c.sourceRef })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) });
}
