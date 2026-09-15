import { describe, expect, it } from "vitest";
import { adoptJobV1, assertAdoptJob, capFromImportedAcceptedValue, importedLineage } from "./job-import.js";
import { money } from "./money.js";

const base={version:"adopt-job.v1",jobId:"10000000-0000-4000-8000-000000000001",baselineId:"20000000-0000-4000-8000-000000000002",title:"Synthetic underway job",lifecyclePoint:"live",provenance:"imported",lineageStrength:"builder_attested_weaker",baselineHash:"a".repeat(64),baselineDescription:"Builder-stated accepted scope",acceptedNetValuePence:100100,recoveryCapPence:1502,acceptedValueSource:"builder_attestation",attestedByMembershipId:"30000000-0000-4000-8000-000000000003",attestedAt:new Date(0),importTermsVersion:"synthetic_import_terms_candidate.v1",feePolicyVersion:"reference_fee_policy_v1",mode:"synthetic_candidate"} as const;
describe("in-flight job adoption",()=>{
  it("fixes the candidate cap exactly from builder-stated accepted value",()=>expect(capFromImportedAcceptedValue(money(100100))).toEqual(money(1502)));
  it("does not allow AI to supply accepted value or cap",()=>expect(()=>adoptJobV1.parse({...base,acceptedValueSource:"ai_estimate"})).toThrow());
  it("rejects cap enlargement and labels imported lineage as weaker",()=>{expect(()=>assertAdoptJob({...base,recoveryCapPence:1503})).toThrow("IMPORT_CAP_MISMATCH");expect(importedLineage({provenance:"imported",id:base.jobId}).lineageLabel).toMatch(/weaker/i);});
});
