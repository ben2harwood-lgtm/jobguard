import { describe, expect, it } from "vitest";
import { canonicalSimulationFeeStatementJson, sha256, downloadIssuedSimulationFeeStatement,
  issuedSimulationFeeStatementV1, simulationFeeStatementCommandV1 } from "./index.js";
const id="10000000-0000-4000-8000-000000000001", hash="a".repeat(64);
const gbp=(pence:number)=>({pence,currency:"GBP"});
const fixture=()=>({version:"issued-simulation-fee-statement.v1",statementId:id,jobId:id,number:"DEMO-FEE-000001",namespace:"success_fee.synthetic.v1",
 environment:"synthetic_demo",policyVersion:"reference_fee_policy_v3",qualifyingPrincipal:{numerator:"282000",denominator:"1"},
 cumulativeFeePrincipal:gbp(28200),documentPrincipal:gbp(28200),postingHistory:[{journalId:id,principal:gbp(3200)},{journalId:"10000000-0000-4000-8000-000000000002",principal:gbp(25000)}],original:null,
 sourceSnapshot:{adjustments:{paymentReversalIds:[],creditNoteIds:[],evidenceInvalidationIds:[]},postingRevision:2,qualifyingPrincipal:{numerator:"282000",denominator:"1"},feePence:28200,
  derivations:[{derivationId:id,reviewId:id,authorizationId:id,statementHash:hash}],
  sources:[{assessmentId:id,currentAssessmentId:id,sourceHash:hash,reviewAuthorizationId:id,allocationIds:[id],remainingPrincipal:{numerator:"282000",denominator:"1"},reasonCodes:[]}]},
 settlementHistory:{state:"integration_unavailable",dependency:"M4-12-S"},
 warning:"Simulation statement — proposed policy, principal only; not a tax invoice or real amount due",vatLabel:"VAT not calculated",sandboxLabel:"Practice sandbox — synthetic data; nothing is sent or charged"});
describe("issued simulation statement download",()=>{
 it("keeps exact number, sources, approvals, rational Q and bytes without a posting or collection port",()=>{
  const doc=fixture(), before=structuredClone(doc),digest=sha256(canonicalSimulationFeeStatementJson(doc));
  const file=downloadIssuedSimulationFeeStatement(doc,digest);
  expect(file.document).toEqual(doc);expect(doc).toEqual(before);
  expect(new TextDecoder().decode(file.bytes)).toBe(canonicalSimulationFeeStatementJson(doc));
  expect(file.filename).toBe("DEMO-FEE-000001.v1.json");expect(file.canonicalJson).toContain("VAT not calculated");
  expect(file.document.cumulativeFeePrincipal.pence).toBe(28200);
  expect(file.document.qualifyingPrincipal).toEqual({numerator:"282000",denominator:"1"});
  for(const label of ['"base"','"cap"','"credit"'])expect(file.canonicalJson).not.toContain(label);
  expect(downloadIssuedSimulationFeeStatement(JSON.parse(file.canonicalJson),digest).bytes).toEqual(file.bytes);
 });
 it("keeps the original hash and represents a linked -GBP250 correction with GBP32 balance",()=>{
  const first=fixture(),originalHash=sha256(canonicalSimulationFeeStatementJson(first));
  const correction={...fixture(),statementId:"10000000-0000-4000-8000-000000000003",number:"DEMO-FEE-000002",
   original:{statementId:id,documentHash:originalHash},documentPrincipal:gbp(-25000),cumulativeFeePrincipal:gbp(3200),qualifyingPrincipal:{numerator:"32000",denominator:"1"},
   sourceSnapshot:{...fixture().sourceSnapshot,qualifyingPrincipal:{numerator:"32000",denominator:"1"},feePence:3200,sources:fixture().sourceSnapshot.sources.map(s=>({...s,remainingPrincipal:{numerator:"32000",denominator:"1"},sourceHash:"b".repeat(64)}))}};
  const file=downloadIssuedSimulationFeeStatement(correction,sha256(canonicalSimulationFeeStatementJson(correction)));
  expect(file.document.documentPrincipal.pence).toBe(-25000);expect(file.document.cumulativeFeePrincipal.pence).toBe(3200);
  expect(sha256(canonicalSimulationFeeStatementJson(first))).toBe(originalHash);
  expect(file.document.original?.documentHash).toBe(originalHash);
 });
 it("refuses changed hashes and inconsistent snapshot summaries",()=>{
  expect(()=>downloadIssuedSimulationFeeStatement(fixture(),hash)).toThrow("SIMULATION_FEE_STATEMENT_HASH_MISMATCH");
  expect(issuedSimulationFeeStatementV1.safeParse({...fixture(),cumulativeFeePrincipal:gbp(3200)}).success).toBe(false);
  expect(issuedSimulationFeeStatementV1.safeParse({...fixture(),number:"client-number"}).success).toBe(false);
 });
 it("accepts exact commands and rejects client money, sources, tenant and provider authority",()=>{
  for(const action of ["issue","approve"]){
   const c={version:"simulation-fee-statement-command.v1",commandId:id,action,...(action==="approve"?{statementId:id,statementHash:hash}:{})};
   expect(simulationFeeStatementCommandV1.safeParse(c).success).toBe(true);
   for(const key of ["tenantId","amountPence","sourceSnapshot","paid","collect","environment"])
    expect(simulationFeeStatementCommandV1.safeParse({...c,[key]:true}).success).toBe(false);
  }
 });
});
it("preserves withheld allocation, payer receipt, approval and reversal links without a fabricated catch assessment",()=>{
 const doc=fixture();
 const source={caseId:id,recoveryAllocationId:id,paymentId:id,invoiceId:id,sourceHash:hash,reviewAuthorizationId:id,
  remainingPrincipal:{numerator:"282000",denominator:"1"},reversalIds:[]};
 const withheld={...doc,sourceSnapshot:{...doc.sourceSnapshot,sources:[source]}};
 const digest=sha256(canonicalSimulationFeeStatementJson(withheld));
 expect(downloadIssuedSimulationFeeStatement(withheld,digest).document.sourceSnapshot.sources).toEqual([source]);
 for(const key of ["caseId","recoveryAllocationId","paymentId","invoiceId","reviewAuthorizationId","sourceHash","remainingPrincipal","reversalIds"]){
  const invalid:Record<string,unknown>={...source};delete invalid[key];
  expect(issuedSimulationFeeStatementV1.safeParse({...withheld,sourceSnapshot:{...withheld.sourceSnapshot,sources:[invalid]}}).success).toBe(false);
 }
 expect(issuedSimulationFeeStatementV1.safeParse({...withheld,sourceSnapshot:{...withheld.sourceSnapshot,sources:[{...source,assessmentId:id}]}}).success).toBe(false);
});
