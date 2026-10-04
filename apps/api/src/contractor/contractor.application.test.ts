import { afterEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ContractorApplication, contractorHttpStatus } from "./contractor.application.js";
const prior=process.env.JOBGUARD_ENV;
afterEach(()=>{if(prior===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=prior;});
describe('contractor application boundaries',()=>{
 it('refuses production/pilot initialization and forged synthetic requests before database access',async()=>{
  const app=new ContractorApplication(new Pool());
  for(const mode of ['production_billing','pilot_no_charge']){process.env.JOBGUARD_ENV=mode;await expect(app.start({version:'contractor-principal.v1',sessionId:'11111111-1111-4111-8111-111111111111'},{version:'contractor-practice.v1',environment:'synthetic_demo'})).rejects.toMatchObject({code:'MODE_FORBIDDEN'});}
 });
 it('rejects absent/malformed authentication and malformed queries before database access',async()=>{
  process.env.JOBGUARD_ENV='synthetic_demo';const app=new ContractorApplication(new Pool());
  await expect(app.resume(null)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await expect(app.start({version:'contractor-principal.v1',sessionId:'11111111-1111-4111-8111-111111111111'},{version:'contractor-practice.v1',environment:'production_billing'})).rejects.toMatchObject({code:'INVALID_COMMAND'});
  await expect(app.read({version:'contractor-principal.v1',sessionId:'11111111-1111-4111-8111-111111111111'},{tenantId:'not-a-uuid'})).rejects.toMatchObject({code:'INVALID_COMMAND'});
  expect(contractorHttpStatus({code:'STALE_REVISION'})).toBe(409);expect(contractorHttpStatus({code:'NOT_FOUND'})).toBe(404);expect(contractorHttpStatus({code:'INVALID_RULE_DOCUMENT'})).toBe(422);
 });
});
