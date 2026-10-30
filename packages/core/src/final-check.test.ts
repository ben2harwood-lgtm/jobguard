import { describe, expect, it } from "vitest";
import { finalCheckDispositionV1, finalCheckTaskV1, checkSourceCompletion, reconcileFinalCheck, finalCheckIncludedReference, FINAL_CHECK_EMPTY_TEXT, FINAL_CHECK_BUILDER_CAPTURE } from "./final-check.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const capture = {version:"shadow-capture.v1",tenantId:id(1),jobId:id(2),id:id(3),scopeItemId:id(4),revisionId:id(5),serverRecordedAt:"2026-10-12T10:00:00.000001Z",valuePence:null,kind:"log_extra",state:"draft",scopeArea:"job",description:"outside tap",recordedPhase:"pre_lock",aiStructured:false,sourceRef:"synthetic"};
const signal = {tenantId:id(1),jobId:id(2),signalId:id(9),description:"outside tap",scopeArea:"job",scopeItemId:null,coalescedIntoSignalId:null,hasEvidence:true,permanentExclusion:false};
const locked = {tenantId:id(1),jobId:id(2),captures:[],baselineItemIds:[],lines:[]};
describe("SV-5 pure reconciliation",()=>{
 it("SV5-03 pending, failed, unsupported and missing sources cannot complete; zero-result is explicit",()=>{
  const source={id:id(3),inputHash:"a".repeat(64)};
  for(const status of ["pending","failed","unsupported"] as const)expect(checkSourceCompletion([source],[{...source,status}])).toBe(false);
  expect(checkSourceCompletion([source],[])).toBe(false);
  expect(checkSourceCompletion([source],[{...source,status:"zero_result"}])).toBe(true);
  expect(checkSourceCompletion([source],[{...source,inputHash:"b".repeat(64),status:"zero_result"}])).toBe(false);
 });
 it("the job's own walk-it text is listed as builder capture and never needs a scan result",()=>{
  const walkIt={id:id(3),inputHash:"a".repeat(64),sourceKind:FINAL_CHECK_BUILDER_CAPTURE,evidenceId:null},photo={id:id(4),inputHash:"b".repeat(64),sourceKind:"completion_photo"};
  expect(checkSourceCompletion([walkIt],[])).toBe(true);
  expect(checkSourceCompletion([walkIt,photo],[])).toBe(false);
  expect(checkSourceCompletion([walkIt,photo],[{...photo,status:"zero_result"}])).toBe(true);
  // An evidence file whose free-text type collides is not exempt.
  expect(checkSourceCompletion([{...walkIt,evidenceId:id(5)}],[])).toBe(false);
 });
 it("SV5-04 empty inventory has an explicit normal zero-result message",()=>{
  expect(checkSourceCompletion([],[])).toBe(true);
  expect(FINAL_CHECK_EMPTY_TEXT).toBe("JobGuard's final check found nothing missing from your bill.");
 });
 it("SV5-05 SV5-07 all capture states and ambiguous overlap favour the builder",()=>{
  for(const state of ["draft","priced","approved","rejected","withdrawn"])expect(reconcileFinalCheck(signal,{...locked,captures:[{...capture,state}]}).outcome).toBe("builder_captured");
  expect(reconcileFinalCheck(signal,{...locked,captures:[{...capture,kind:"final_review",state:null}]}).outcome).toBe("builder_captured");
 });
 it("SV5-06 SV5-08 baseline and exact locked lines exclude work",()=>{
  expect(reconcileFinalCheck({...signal,scopeItemId:id(4)},{...locked,baselineItemIds:[id(4)]}).outcome).toBe("already_in_original_scope");
  expect(reconcileFinalCheck({...signal,scopeItemId:id(4)},{...locked,lines:[{id:id(6),scopeItemId:id(4)}]}).references).toEqual([id(6)]);
 });
 it("SV5-10 permanent disclosure excludes; SV5-11 SV5-19 coalesced identity stays excluded on rerun",()=>{
  expect(reconcileFinalCheck({...signal,permanentExclusion:true},locked).outcome).toBe("not_enough_evidence");
  expect(reconcileFinalCheck({...signal,coalescedIntoSignalId:id(7)},locked)).toEqual(reconcileFinalCheck({...signal,coalescedIntoSignalId:id(7)},locked));
  expect(reconcileFinalCheck({...signal,coalescedIntoSignalId:id(7)},locked).outcome).toBe("duplicate_signal");
 });
 it("SV5-12 exact included references; unmatched claims are disputed",()=>{
  expect(finalCheckIncludedReference("already_included",id(6),[id(6)],[])).toBe("already_included");
  expect(finalCheckIncludedReference("already_included",null,[id(6)],[])).toBe("attribution_disputed");
  expect(()=>finalCheckIncludedReference("already_included",id(8),[id(6)],[])).toThrow("FINAL_CHECK_FORBIDDEN");
 });
 it("SV5-15 synthetic diary proposal absent from frozen records is revealed with recorded comparisons",()=>{
  expect(reconcileFinalCheck(signal,locked)).toEqual({outcome:"reveal",references:[],comparisons:{baselineItemIds:[],captureIds:[],lockedLineIds:[]}});
 });
 it("SV5-16 SV5-30 commands cannot claim authority or enable a confirmation",()=>{
  const body={version:"final-check.disposition.v1",commandId:id(1),lockId:id(2),runId:id(3),signalId:id(4),expectedSignalRevision:1,answer:"not_completed",referenceId:null};
  expect(finalCheckDispositionV1.safeParse(body).success).toBe(true);
  for(const field of ["tenantId","actor","origin","cutoff","completion","entitlement","settlement"])expect(finalCheckDispositionV1.safeParse({...body,[field]:id(7)}).success).toBe(false);
  expect(finalCheckDispositionV1.safeParse({...body,answer:"confirmed_extra"}).success).toBe(false);
  expect(finalCheckTaskV1.safeParse({version:"final-check.task.v1",jobId:id(1),manifestId:id(2),completion:true}).success).toBe(false);
 });
});
