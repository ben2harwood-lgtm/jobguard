import { expect, it } from "vitest";
import { assessAttestedReceipt, generatedPracticeFeedEvents, practiceFeedCommandV1, projectPracticeFeedMovements, syntheticPracticeMovementCatalogueV1 } from "./practice-feed.js";
const first="receipt-480-a",second="receipt-480-b";
const events=(key:typeof first|typeof second)=>generatedPracticeFeedEvents(key,"settled").map(e=>({...e,sourceHash:"a".repeat(64)}));
it("SV-6 gives equal GBP 480 settlements distinct immutable identities and matches each only once",()=>{
 const definitions=syntheticPracticeMovementCatalogueV1.filter(d=>d.fixture==="test-g");
 expect(definitions.map(d=>[d.movement,d.grossPence])).toEqual([[first,48000],[second,48000]]);
 const movements=projectPracticeFeedMovements("account",[...events(first),...events(second),...events(first)],[]);
 expect(movements).toHaveLength(2);expect(new Set(movements.map(m=>m.id)).size).toBe(2);
 const receipt={paymentId:"pay-a",amountPence:48000,currency:"GBP" as const,reversed:false};
 expect(assessAttestedReceipt(receipt,movements,[])).toMatchObject({candidateMovementKey:first,canMatch:true});
 const match={paymentId:"pay-a",movementKey:first,paymentReversed:false} as const;
 expect(assessAttestedReceipt({...receipt,paymentId:"pay-b"},movements,[match])).toMatchObject({candidateMovementKey:second,canMatch:true});
 expect(assessAttestedReceipt(receipt,movements,[match])).toMatchObject({status:"qualifies",matchedMovementKey:first});
 expect(assessAttestedReceipt({...receipt,paymentId:"pay-c"},movements,[match,{paymentId:"pay-b",movementKey:second,paymentReversed:false}])).toMatchObject({reason:"movement_already_matched",canMatch:false});
});
it("SV-6 still refuses client-supplied settlement amounts and pending movements",()=>{
 expect(practiceFeedCommandV1.safeParse({version:"practice-feed-command.v1",commandId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",expectedRevision:1,action:"advance",movement:first,step:"settled",grossPence:48000}).success).toBe(false);
 const pending=projectPracticeFeedMovements("account",generatedPracticeFeedEvents(first,"pending").map(e=>({...e,sourceHash:"a".repeat(64)})),[]);
 expect(assessAttestedReceipt({paymentId:"pay-a",amountPence:48000,currency:"GBP",reversed:false},pending,[])).toMatchObject({reason:"pending",canMatch:false});
});
