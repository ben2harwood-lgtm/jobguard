import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,expect,it,vi } from "vitest";
import { RecoveryAttributionController } from "./recovery-attribution.controller.js";
import { RecoveryAttributionApplication,RecoveryAttributionDependencyError } from "./recovery-attribution.application.js";
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
