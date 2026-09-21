import type { Pool } from "pg";
import { DEMO_IDENTITY_USER_ID,DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,RecoveryCaseRepository,verifiedTenantContextFromMembership } from "@jobguard/db";
import { recoveryCaseCommandV1 } from "./recovery-case.contracts.js";
const context=()=>verifiedTenantContextFromMembership({identityUserId:DEMO_IDENTITY_USER_ID,membershipId:DEMO_MEMBERSHIP_ID,tenantId:DEMO_TENANT_ID} as any);
export class RecoveryCaseApplication{private repo;constructor(pool:Pool){this.repo=new RecoveryCaseRepository(pool)}async list(jobId:string){return{version:"recovery-case-workbench.v1" as const,environment:"synthetic_demo" as const,realExternalActions:0 as const,cases:await this.repo.list(context(),jobId)}}async command(jobId:string,raw:unknown){await this.repo.command(context(),jobId,recoveryCaseCommandV1.parse(raw));return this.list(jobId)}}
