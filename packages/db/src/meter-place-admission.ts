import { z } from "zod";
/** No executor is exported: the authenticated pre-mutation source handoff is STOP.
 * A pure kernel result must never become a read-then-write permit. */
export const meterPlaceAdmissionHoldV1 = z.object({
 version:z.literal("meter-place-admission-hold.v1"),status:z.literal("held"),
 code:z.literal("METER_PLACE_SOURCE_HANDOFF_HELD"),
}).strict().readonly();
export const meterPlaceAdmissionHold = meterPlaceAdmissionHoldV1.parse({
 version:"meter-place-admission-hold.v1",status:"held",code:"METER_PLACE_SOURCE_HANDOFF_HELD",
});
