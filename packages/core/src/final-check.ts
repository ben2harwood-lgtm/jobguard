import { z } from "zod";
import { matchBuilderCapture } from "./shadow-domain/capture.js";

export const FINAL_CHECK_EMPTY_TEXT = "JobGuard's final check found nothing missing from your bill." as const;
const uuid = z.string().uuid();
export const finalCheckDispositionV1 = z.object({
 version:z.literal("final-check.disposition.v1"), commandId:uuid, lockId:uuid, runId:uuid, signalId:uuid,
 expectedSignalRevision:z.number().int().nonnegative().safe(),
 answer:z.enum(["already_included","in_original_scope","not_completed","not_chargeable","wrong_job_or_evidence"]),
 referenceId:uuid.nullable(),
}).strict().refine(v=>["already_included","in_original_scope"].includes(v.answer)||v.referenceId===null);
export type FinalCheckDisposition = z.infer<typeof finalCheckDispositionV1>;
/** "Yes, this was extra work": creates only an unpriced catch variation; the server checks everything else. */
export const finalCheckCatchV1 = z.object({
 version:z.literal("final-check.catch.v1"), commandId:uuid, lockId:uuid, runId:uuid, signalId:uuid,
 expectedSignalRevision:z.number().int().nonnegative().safe(),
}).strict();
export type FinalCheckCatch = z.infer<typeof finalCheckCatchV1>;
export const finalCheckTaskV1 = z.object({version:z.literal("final-check.task.v1"),jobId:uuid,manifestId:uuid}).strict();
export class FinalCheckError extends Error {
 constructor(readonly code:"INVALID_FINAL_CHECK_INPUT"|"FINAL_CHECK_FORBIDDEN"|"FINAL_CHECK_PENDING"|"FINAL_CHECK_SOURCE_CHANGED"|"FINAL_CHECK_FAILED"|"IDEMPOTENCY_CONFLICT"|"STALE_REVISION"|"FINAL_ACCOUNT_LOCK_REQUIRED"){super(code);}
}
export function parseFinalCheckDisposition(raw:unknown):FinalCheckDisposition{
 const p=finalCheckDispositionV1.safeParse(raw);if(!p.success)throw new FinalCheckError("INVALID_FINAL_CHECK_INPUT");return Object.freeze(p.data);
}
export type FinalCheckSourceStatus="pending"|"failed"|"unsupported"|"zero_result"|"detected";
/** Compare every inventory identity to its latest append-only result, including input bytes. */
/** The job's own walk-it text: listed in the inventory as builder capture (AGENTS 5.14), never scanned. */
export const FINAL_CHECK_BUILDER_CAPTURE="builder_capture_not_scanned";
/** Only the job-linked capture entry qualifies; an evidence file whose free-text type collides is still scanned. */
export const isBuilderCaptureNotScanned=(s:{sourceKind?:string;evidenceId?:string|null}):boolean=>s.sourceKind===FINAL_CHECK_BUILDER_CAPTURE&&s.evidenceId===null;
export function checkSourceCompletion(sources:readonly {id:string;inputHash:string;sourceKind?:string;evidenceId?:string|null}[],results:readonly {id:string;inputHash:string;status:FinalCheckSourceStatus}[]):boolean{
 if(new Set(sources.map(s=>s.id)).size!==sources.length)return false;
 return sources.every(s=>{if(isBuilderCaptureNotScanned(s))return true;const r=results.findLast(r=>r.id===s.id);return r?.inputHash===s.inputHash&&(r.status==="zero_result"||r.status==="detected");});
}
export function finalCheckIncludedReference(answer:"already_included"|"in_original_scope",id:string|null,lines:readonly string[],baseline:readonly string[]):"already_included"|"in_original_scope"|"attribution_disputed"{
 if(id===null)return "attribution_disputed";
 if(!(answer==="already_included"?[...lines,...baseline]:baseline).includes(id))throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
 return answer;
}
export type FinalCheckOutcome="already_in_original_scope"|"builder_captured"|"already_on_final_account"|"duplicate_signal"|"not_enough_evidence"|"reveal";
/** Only server-read frozen inputs. This function proposes exclusions/reveal, never commercial effects. */
export function reconcileFinalCheck(signal:{tenantId:string;jobId:string;signalId:string;description:string;scopeArea:string;scopeItemId:string|null;coalescedIntoSignalId:string|null;hasEvidence:boolean;permanentExclusion:boolean},locked:{tenantId:string;jobId:string;captures:readonly unknown[];baselineItemIds:readonly string[];lines:readonly {id:string;scopeItemId:string}[]}):{outcome:FinalCheckOutcome;references:readonly string[];comparisons:{baselineItemIds:readonly string[];captureIds:readonly string[];lockedLineIds:readonly string[]}}{
 if(signal.tenantId!==locked.tenantId||signal.jobId!==locked.jobId)throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
 const match=matchBuilderCapture({version:"shadow-match.v1",tenantId:signal.tenantId,jobId:signal.jobId,scopeArea:signal.scopeArea,description:signal.description,dateCompatibility:"unknown",valueCompatibility:"unknown",ruleVersion:"builder-favourable-match.v1"},locked.captures);
 const comparisons={baselineItemIds:[...locked.baselineItemIds],captureIds:locked.captures.map(c=>z.object({id:uuid}).passthrough().parse(c).id),lockedLineIds:locked.lines.map(l=>l.id)};
 const result=(outcome:FinalCheckOutcome,references:readonly string[]=[])=>({outcome,references,comparisons});
 if(signal.coalescedIntoSignalId)return result("duplicate_signal",[signal.coalescedIntoSignalId]);
 if(signal.scopeItemId&&locked.baselineItemIds.includes(signal.scopeItemId))return result("already_in_original_scope",[signal.scopeItemId]);
 if(match.outcome!=="unmatched")return result(match.outcome,match.references.map(r=>r.id));
 const lines=locked.lines.filter(l=>l.scopeItemId===signal.scopeItemId);
 if(lines.length)return result("already_on_final_account",lines.map(l=>l.id));
 if(!signal.hasEvidence||signal.permanentExclusion)return result("not_enough_evidence");
 return result("reveal");
}
