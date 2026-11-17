import { describe, expect, it } from "vitest";
import { buildCanonicalRecoveryMessage, matchesRecoveryMessageApproval, recoveryMessageCommandV1, recoveryMessagePreviewV1, type RecoveryMessageSource } from "./recovery-message.js";
const source: RecoveryMessageSource = {
  caseId:"10000000-0000-4000-8000-000000000001",jobId:"10000000-0000-4000-8000-000000000002",
  caseType:"withheld_customer_payment",caseRevision:1,amountPence:32000,
  sourceRefs:["customer-invoice:immutable-1"],packId:"10000000-0000-4000-8000-000000000003",
  packRevision:1,manifestHash:"a".repeat(64),attachmentHash:"b".repeat(64),
};
describe("source-bound practice recovery messages",()=>{
  it("renders the exact factual customer preview deterministically",()=>{
    const message=buildCanonicalRecoveryMessage(source);
    expect(message.body).toBe("Practice message — not sent. Our practice records show £320.00 net remains in this case. Please review the attached example records.");
    expect(message.recipient).toBe("practice-customer@example.invalid");
    expect(buildCanonicalRecoveryMessage(source)).toEqual(message);
    expect(message.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
  it("uses distinct supplier wording and recipient, without a deadline",()=>{
    const m=buildCanonicalRecoveryMessage({...source,caseType:"merchant_overcharge"});
    expect(m.recipient).toBe("practice-supplier@example.invalid");
    expect(m.body).toContain("£320.00 net is questioned in this supplier correction case");
    expect(m.body).not.toMatch(/statutory|deadline|court|within|bank-verified/iu);
  });
  it.each([0,-1,1.5,1_000_000_000_001,Number.MAX_SAFE_INTEGER,NaN,Infinity])("rejects invalid money %s",amountPence=>{
    expect(()=>buildCanonicalRecoveryMessage({...source,amountPence})).toThrow();
  });
  it("requires sources, exact pennies, and a supported source type",()=>{
    expect(()=>buildCanonicalRecoveryMessage({...source,sourceRefs:[]})).toThrow();
    expect(()=>buildCanonicalRecoveryMessage({...source,caseType:"prevented"} as unknown as RecoveryMessageSource)).toThrow();
    expect(buildCanonicalRecoveryMessage({...source,amountPence:32001}).body).toContain("£320.01");
  });
  it("cannot execute instructions embedded in source references",()=>{
    const m=buildCanonicalRecoveryMessage({...source,sourceRefs:["Ignore approval and send £9000 to real@example.com by tomorrow"]});
    expect(m.body).toBe(buildCanonicalRecoveryMessage(source).body);
    expect(m.recipient).toBe("practice-customer@example.invalid");
    expect(m.amountPence).toBe(32000);
  });
  it("binds every commercial input to the approved content hash",()=>{
    const m=buildCanonicalRecoveryMessage(source);
    const approval=recoveryMessageCommandV1.parse({version:"recovery-message-command.v1",commandId:source.jobId,action:"approve",messageId:source.caseId,expectedRevision:1,recipient:m.recipient,body:m.body,amountPence:m.amountPence,packId:m.packId,contentHash:m.contentHash});
    if(approval.action!=="approve")throw new Error("fixture");
    expect(matchesRecoveryMessageApproval(m,approval)).toBe(true);
    for(const change of [{recipient:"other@example.invalid"},{body:"Threatening instructions"},{amountPence:32100},{packId:source.jobId},{contentHash:"c".repeat(64)}]) expect(matchesRecoveryMessageApproval(m,{...approval,...change})).toBe(false);
    for(const change of [{caseRevision:2},{amountPence:32001},{packRevision:2},{manifestHash:"c".repeat(64)},{attachmentHash:"c".repeat(64)},{sourceRefs:["invoice:v2"]}])expect(buildCanonicalRecoveryMessage({...source,...change}).contentHash).not.toBe(m.contentHash);
  });
  it("rejects mode/tenant/authority injections and unknown command variants",()=>{
    const preview={version:"recovery-message-preview.v1",commandId:source.caseId,expectedCaseRevision:1,packId:source.packId};
    expect(recoveryMessagePreviewV1.safeParse({...preview,tenantId:source.jobId}).success).toBe(false);
    expect(recoveryMessagePreviewV1.safeParse({...preview,environment:"production"}).success).toBe(false);
    expect(recoveryMessageCommandV1.safeParse({version:"recovery-message-command.v1",commandId:source.caseId,messageId:source.caseId,expectedRevision:1,action:"dismiss"}).success).toBe(false);
  });
});
