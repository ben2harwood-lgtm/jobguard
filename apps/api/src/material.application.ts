import { PracticeAccess } from "./practice-access.js";
import type { Pool } from "pg";
import { MaterialRepository, practiceMaterialPool } from "@jobguard/db";
import { materialRateCommandV1, materialRequirementCommandV1 } from "./material.contracts.js";

export class MaterialApplication {
 private readonly access: PracticeAccess;
 constructor(private readonly pool: Pool, sessionId?: string) { this.access=new PracticeAccess(pool,sessionId); }
 async addRate(raw: unknown) {
  const practice=await this.access.session();
  return new MaterialRepository(practiceMaterialPool(this.pool,practice.digest)).addRate(practice.context,materialRateCommandV1.parse(raw));
 }
 async addRequirement(jobId: string, raw: unknown) {
  const practice=await this.access.job(jobId);
  return new MaterialRepository(practiceMaterialPool(this.pool,practice.digest)).addRequirement(practice.context,{jobId,...materialRequirementCommandV1.parse(raw)});
 }
 async view(jobId: string) {
  const practice=await this.access.job(jobId),today=new Date().toISOString().slice(0,10);
  return {version:"material-workspace.v1",environment:"synthetic_demo",jobId,asOf:today,materials:await new MaterialRepository(practiceMaterialPool(this.pool,practice.digest)).view(practice.context,jobId,today),realExternalActions:0};
 }
}
