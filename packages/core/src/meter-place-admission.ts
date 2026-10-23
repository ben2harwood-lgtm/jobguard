import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { computeSmallPlaceAllowance, fixedMeterPlacesV1, groupSuppliedMeterPlaces, londonMeterDateV1, syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";

const uuid = z.string().uuid().transform(value => value.toLowerCase());
const jobs = fixedMeterPlacesV1.unwrap().innerType().shape.jobs;
const job = jobs.unwrap().element;
/** Supplied synthetic facts only. Neither this schema nor its result establishes authority.
 * The source kinds are local kernel vocabulary, NOT an accepted command adapter enum. */
export const meterPlaceAdditionV1 = z.object({
 version:z.literal("meter-place-addition.v1"),environment:z.literal("synthetic_demo"),
 plan:z.enum(["Solo","Builder"]),planRevision:z.number().int().positive().safe(),date:londonMeterDateV1,
 source:z.object({kind:z.enum(["switch_live","resume","reopen","live_import","day31","small_trip","first_site_evidence"]),
  id:uuid,expectedRevision:z.number().int().nonnegative().safe()}).strict(),
 committedJobs:jobs,prospective:job,
}).strict().superRefine((value,context)=>{
 const existing=value.committedJobs.find(j=>j.jobId===value.prospective.jobId);
 const trip=value.source.kind==="small_trip";
 if(new Set(value.committedJobs.map(j=>j.jobId)).size!==value.committedJobs.length ||
  value.committedJobs.some(j=>j.tenantId!==value.prospective.tenantId) ||
  (existing!==undefined && !trip) ||
  (trip && (!existing || !existing.small || value.prospective.small ||
   existing.customerId!==value.prospective.customerId || existing.siteId!==value.prospective.siteId)))
  context.addIssue({code:z.ZodIssueCode.custom,message:"One tenant and distinct committed/prospective jobs required"});
});
export class MeterPlaceAdmissionError extends Error {
 constructor(readonly code:"INVALID_METER_PLACE_ADMISSION"|"METER_FIRST_EVIDENCE_OVERLAP_HELD") {super(code);this.name="MeterPlaceAdmissionError";}
}
/** Capacity oracle for independently supplied synthetic committed membership, including jobs
 * not yet counting today. No IO, Decision, permit, billing or runtime source reconstruction.
 * Automatic kinds are only test inputs; no runtime caller can select them as a bypass. */
export function evaluateMeterPlaceAddition(raw:unknown) {
 const parsed=meterPlaceAdditionV1.safeParse(raw);
 if(!parsed.success)throw new MeterPlaceAdmissionError("INVALID_METER_PLACE_ADMISSION");
 const input=parsed.data;
 if(input.source.kind==="first_site_evidence")throw new MeterPlaceAdmissionError("METER_FIRST_EVIDENCE_OVERLAP_HELD");
 const facts=(supplied:typeof input.committedJobs)=>{
  const grouped=groupSuppliedMeterPlaces({version:"meter-fixed-places.v1",date:input.date,jobs:supplied});
  const smallPlaces=grouped.places.filter(place=>place.small).length;
  const allowance=computeSmallPlaceAllowance({version:"meter-small-allowance.v1",plan:input.plan,rawPlaces:grouped.places.length,smallPlaces});
  return {rawJobs:supplied.length,groupedPlaces:grouped.places.length,smallPlaces,freeSmallPlaces:allowance.freeSmallPlaces,chargeableCommittedPlaces:allowance.countedPlaces};
 };
 const beforeFacts=facts(input.committedJobs),afterFacts=facts([...input.committedJobs.filter(j=>j.jobId!==input.prospective.jobId),input.prospective]);
 const before=beforeFacts.chargeableCommittedPlaces,after=afterFacts.chargeableCommittedPlaces;
 const terms=syntheticMeterPolicyV1[input.plan],cap=terms.included+terms.extrasCap;
 const automatic=input.source.kind==="day31"||input.source.kind==="small_trip";
 let decision:"admit"|"admit_upgrade_due"|"refuse_upgrade_required"|"admit_track_review_due"="admit";
 if(after>before && after>cap) {
  if(input.plan==="Builder" && after>cap+1)decision="admit_track_review_due";
  else if(input.plan==="Solo" && after>cap+1 && !automatic)decision="refuse_upgrade_required";
  else decision="admit_upgrade_due";
 }
 // Explicit field order, normalized UUIDs and sorted jobs define the v1 hash recipe.
 const canonical={version:input.version,environment:input.environment,plan:input.plan,planRevision:input.planRevision,date:input.date,
  source:{kind:input.source.kind,id:input.source.id,expectedRevision:input.source.expectedRevision},
  committedJobs:[...input.committedJobs].sort((a,b)=>a.jobId<b.jobId?-1:a.jobId>b.jobId?1:0).map(j=>({...j})),prospective:{...input.prospective}};
 return Object.freeze({decision,before,after,planRevision:input.planRevision,sourceHash:sha256(JSON.stringify(canonical)),
  beforeFacts:Object.freeze(beforeFacts),afterFacts:Object.freeze(afterFacts),maximumPence:terms.maximumPence});
}
