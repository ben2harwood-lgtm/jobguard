import { describe, expect, it } from "vitest";
import { recoveryCaseStateFullV1, recoveryEventTypeV1, transitionRecoveryCase } from "./recovery-case.js";

describe("complete recovery state machine",()=>{
 const expected = {
  identified: { assemble_evidence: "evidence_assembled", prevent: "prevented", close_no_recovery: "closed_no_recovery" },
  evidence_assembled: { start_pursuit: "pursuing", start_negotiation: "negotiating", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", dispute: "negotiating" },
  pursuing: { start_negotiation: "negotiating", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", write_off: "closed_no_recovery", dispute: "negotiating" },
  negotiating: { resume_pursuit: "pursuing", record_landing: "partially_landed", close_no_recovery: "closed_no_recovery", write_off: "closed_no_recovery", dispute: "negotiating" },
  partially_landed: { record_landing: "partially_landed", write_off: "closed_no_recovery", dispute: "negotiating", reverse_landing: "evidence_assembled" },
  landed: { close_recovered: "closed_recovered", dispute: "negotiating", reverse_landing: "partially_landed" },
  closed_recovered: { dispute: "negotiating", reverse_landing: "partially_landed" },
  closed_no_recovery: { dispute: "negotiating", reverse_landing: "evidence_assembled" },
  prevented: {},
 };
 for (const state of recoveryCaseStateFullV1.options) {
  for (const event of recoveryEventTypeV1.options) {
   it(`${state} / ${event} has an explicit allowed or forbidden result`, () => {
    const landedPence = ["landed", "closed_recovered"].includes(state) ? 250000
     : ["partially_landed", "closed_no_recovery"].includes(state) ? 100000 : 0;
    const run = () => transitionRecoveryCase({ state, event, claimedPence: 250000, landedPence, amountPence: 100000 });
    const next = (expected[state] as Record<string, string>)[event];
    if (!next) expect(run).toThrowError(/is not allowed/);
    else expect(run()).toEqual({ state: next,
     landedPence: landedPence + (event === "record_landing" ? 100000 : event === "reverse_landing" ? -100000 : 0),
     writtenOffPence: event === "write_off" ? 250000 - landedPence : 0 });
   });
  }
 }
 it.each(["partially_landed", "closed_no_recovery"] as const)("reopens %s after partial and total reversal", state => {
  expect(transitionRecoveryCase({state,event:"reverse_landing",claimedPence:250000,landedPence:100000,amountPence:40000})).toMatchObject({state:"partially_landed",landedPence:60000});
  expect(transitionRecoveryCase({state,event:"reverse_landing",claimedPence:250000,landedPence:100000,amountPence:100000})).toMatchObject({state:"evidence_assembled",landedPence:0});
 });
 it("allows a direct receipt only after evidence and closes only after disposition",()=>{expect(()=>transitionRecoveryCase({state:"identified",event:"record_landing",claimedPence:250000,landedPence:0,amountPence:100000})).toThrow();expect(transitionRecoveryCase({state:"evidence_assembled",event:"record_landing",claimedPence:250000,landedPence:0,amountPence:100000})).toEqual({state:"partially_landed",landedPence:100000,writtenOffPence:0});expect(transitionRecoveryCase({state:"partially_landed",event:"write_off",claimedPence:250000,landedPence:100000})).toEqual({state:"closed_no_recovery",landedPence:100000,writtenOffPence:150000});});
 it("reopens landed value on reversal and makes prevention terminal",()=>{expect(transitionRecoveryCase({state:"closed_recovered",event:"reverse_landing",claimedPence:250000,landedPence:250000,amountPence:100000}).state).toBe("partially_landed");for(const event of recoveryEventTypeV1.options)expect(()=>transitionRecoveryCase({state:"prevented",event,claimedPence:1,landedPence:0,amountPence:1})).toThrow();});
});
