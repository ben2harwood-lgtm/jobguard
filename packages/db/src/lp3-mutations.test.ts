import { describe, expect, it } from "vitest";
import { RecordBuilderAcceptanceMutation, RecordQuoteDispositionMutation } from "./acceptance-repository.js";
import { RecordSimulatedSettlementMutation, SwitchJobLiveMutation } from "./activation-repository.js";
import { lp3MutationHash } from "./lp3-operation.js";
import type { ConsequentialCommand } from "./commands.js";
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",at=new Date("2026-10-01T00:00:00.123Z");
const command={actorMembershipId:id} as ConsequentialCommand;
const acceptance={version:"quote-acceptance.v1",acceptanceId:id,jobId:id,documentId:id,documentVersion:1,documentHash:"a".repeat(64),expectedJobRevision:2,acceptedTotalPence:120120,statedCustomerName:"Fictional 🧱 Café",statedMethod:"email",acceptedAt:at,evidenceId:null};
const activation={version:"switch-live.v1",activationId:id,capSnapshotId:id,syntheticObligationId:null,jobId:id,acceptedDocumentId:id,acceptedDocumentVersion:1,acceptedDocumentHash:"a".repeat(64),expectedJobRevision:2,acceptedNetValuePence:100100,recoveryCapPence:1502,mode:"pilot_no_charge",activationTermsVersion:"pilot_no_charge.v1",feePolicyVersion:"reference_fee_policy_v1",activatedAt:at};
const settlement={version:"simulated-settlement.v1",settlementId:id,obligationId:id,providerEventId:"Fictional 🧱 event",amountPence:7900,currency:"GBP",simulatedAt:at};
const disposition={version:"quote-disposition.v1",eventId:id,jobId:id,documentId:id,documentVersion:1,documentHash:"a".repeat(64),expectedJobRevision:2,kind:"superseded",occurredAt:at};
describe("LP3 runtime mutation binding",()=>{
  it("converts all four actual command input schemas to the shared strict codec",()=>{
    expect(new RecordBuilderAcceptanceMutation(id,acceptance).inputHash(command)).toBe(lp3MutationHash(id,id,acceptance));
    expect(new RecordQuoteDispositionMutation(id,disposition).inputHash(command)).toBe(lp3MutationHash(id,id,disposition));
    expect(new SwitchJobLiveMutation(id,"pilot_no_charge",activation).inputHash(command)).toBe(lp3MutationHash(id,id,activation));
    expect(new RecordSimulatedSettlementMutation(id,"synthetic_demo",settlement).inputHash(command)).toBe(lp3MutationHash(id,id,settlement));
  });
  it("binds revisions and occurrence facts while retaining generated result identities on replay",()=>{
    for(const input of [activation,acceptance,disposition,settlement]){
      const before=lp3MutationHash(id,id,input);
      expect(lp3MutationHash(other,id,input)).not.toBe(before);
      expect(lp3MutationHash(id,other,input)).not.toBe(before);
      if("expectedJobRevision" in input)expect(lp3MutationHash(id,id,{...input,expectedJobRevision:3})).not.toBe(before);
      const generated=Object.fromEntries(Object.entries(input).map(([key,value])=>[key,["activationId","capSnapshotId","syntheticObligationId","acceptanceId","eventId","settlementId"].includes(key)?other:value]));
      expect(lp3MutationHash(id,id,generated)).toBe(before);
    }
  });
  it("canonicalizes Date and UTC text identically without allowing extra facts",()=>{
    expect(lp3MutationHash(id,id,acceptance)).toBe(lp3MutationHash(id,id,{...acceptance,acceptedAt:at.toISOString()}));
    expect(()=>lp3MutationHash(id,id,{...acceptance,approved:true})).toThrow();
    expect(lp3MutationHash(id,id,{...acceptance,acceptedAt:new Date(at.getTime()+1)})).not.toBe(lp3MutationHash(id,id,acceptance));
  });
});
