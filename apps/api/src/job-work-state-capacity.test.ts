import { expect, it } from "vitest";
import { JobWorkStateError } from "@jobguard/core";
import { jobWorkStateFailure } from "./job-work-state.errors.js";
it("capacity refusal has a plain message and preserves its code", () => {
 expect(jobWorkStateFailure(new JobWorkStateError("METER_UPGRADE_REQUIRED"))).toMatchObject({
  status:409,body:{code:"METER_UPGRADE_REQUIRED",message:"Your Solo plan and grace place are full. Move to Builder before starting this site work."},
 });
});

it("projection mismatch refuses without returning private SQL detail", () => {
 expect(jobWorkStateFailure(new JobWorkStateError("METER_PROJECTION_MISMATCH"))).toMatchObject({status:409,body:{code:"METER_PROJECTION_MISMATCH",message:"The jobs-on-the-go meter could not be verified. Nothing was changed."}});
});
