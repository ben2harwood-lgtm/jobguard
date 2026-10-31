import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,expect,it,vi } from "vitest";
import { RecoveryAttributionController } from "./recovery-attribution.controller.js";
import { RecoveryAttributionApplication,RecoveryAttributionDependencyError,recoveryAttributionFailure } from "./recovery-attribution.application.js";
import { PracticeAccessError } from "@jobguard/db";
afterEach(()=>vi.restoreAllMocks());
it("controller maps nondisclosing access and dependency failures",async()=>{
 const controller=new RecoveryAttributionController({} as Pool),id=randomUUID();
 for(const [code,status] of [["NOT_FOUND",404],["UNAUTHENTICATED",401],["SYNTHETIC_MODE_REQUIRED",403]] as const){
  vi.spyOn(RecoveryAttributionApplication.prototype,"get").mockRejectedValue(new PracticeAccessError(code));
  await expect(controller.get(id)).rejects.toMatchObject({status,response:{code}});
 }
 vi.spyOn(RecoveryAttributionApplication.prototype,"command").mockRejectedValue(new RecoveryAttributionDependencyError());
 await expect(controller.post(id,{})).rejects.toMatchObject({status:503,response:{code:"RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND"}});
});

it("source, stale and replay conflicts are typed; unknown errors are not disguised",()=>{
 for(const code of ["RECOVERY_ATTRIBUTION_REVIEW_EXCLUDED","RECOVERY_ATTRIBUTION_REVIEW_ARTIFACT_CHANGED","RECOVERY_ATTRIBUTION_REVIEW_ALREADY_RECORDED","RECOVERY_ATTRIBUTION_SOURCE_REQUIRED","RECOVERY_ATTRIBUTION_STALE","RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT","RECOVERY_ATTRIBUTION_MOVEMENT_JOB_REQUIRED"])
  expect(recoveryAttributionFailure(new Error(code))).toEqual({status:409,body:{code}});
 expect(recoveryAttributionFailure(new Error("FINAL_CHECK_FORBIDDEN"))).toEqual({status:404,body:{code:"NOT_FOUND"}});
 expect(recoveryAttributionFailure(new Error("network failure"))).toBeNull();
});
