import { describe, expect, it } from "vitest";
import { diaryInputV1, customerMessageInputV1, diaryReadV1, customerMessageReadV1, JOB_DIARY_NOTICE, MAX_JOB_SOURCE_TEXT, JobSourceError } from "./job-sources.js";
const id="a0000000-0000-4000-8000-000000000001";
const diary={version:"job-diary-input.v1",commandId:id,entryMode:"typed",onSite:true,text:"  Fictional fitted outside tap\n"};
describe("SV-7A source contracts (intake remains held)",()=>{
 it("SV7A-01 typed and reviewed dictated fictional text preserve exact text",()=>{
  for(const entryMode of ["typed","dictated_text"]) expect(diaryInputV1.parse({...diary,entryMode}).text).toBe(diary.text);
 });
 it("SV7A-01 empty, invalid, oversized, unsupported mode and extra authority fields are refused",()=>{
  for(const change of [{text:""},{text:"  \n"},{text:"a".repeat(MAX_JOB_SOURCE_TEXT+1)},{text:"a\0b"},{entryMode:"audio"},{tenantId:id},{actorMembershipId:id},{environment:"synthetic_demo"},{fictionalRoleName:"owner"},{onSite:"true"}]) expect(diaryInputV1.safeParse({...diary,...change}).success).toBe(false);
 });
 it("SV7A-02 every diary response has exactly the standing notice and rejects commercial hints",()=>{
  const read={version:"job-diary-read.v1",jobId:id,entries:[],notice:JOB_DIARY_NOTICE,noticeVersion:"job-diary-notice.v1",environment:"synthetic_demo",realExternalActions:0};
  expect(diaryReadV1.parse(read).notice).toBe("Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.");
  for(const change of [{notice:"Use Log an extra"},{signalCount:1},{detectionStatus:"ready"},{suggestion:"bill this"},{feeHint:10}]) expect(diaryReadV1.safeParse({...read,...change}).success).toBe(false);
 });
 it("SV7A-01 Q4 fictional attribution is labelled and cannot replace actual tester authority",()=>{
  const input={version:"customer-message-input.v1",commandId:id,text:"Fictional customer requested an outside tap",fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"}};
  expect(customerMessageInputV1.parse(input).fictionalCustomer.kind).toBe("named_fictional_customer");
  for(const change of [{actorMembershipId:id},{sessionId:id},{fictionalCustomer:{kind:"authenticated_customer",name:"Alex"}},{fictionalCustomer:{kind:"named_fictional_customer",name:"Alex",role:"owner"}}]) expect(customerMessageInputV1.safeParse({...input,...change}).success).toBe(false);
  const read={version:"customer-message-read.v1",jobId:id,messages:[{id,commandId:id,text:input.text,evidence:{id,objectVersionId:"concrete-v1",sha256:"a".repeat(64),serverReceivedAt:"2026-10-13T10:00:00.000001Z"},fictionalCustomer:input.fictionalCustomer,actualTesterMembershipId:id}],environment:"synthetic_demo",realExternalActions:0};
  expect(customerMessageReadV1.parse(read).messages[0]?.actualTesterMembershipId).toBe(id);
  expect(customerMessageReadV1.safeParse({...read,messages:[{...read.messages[0],actualTesterMembershipId:"Fictional Alex"}]}).success).toBe(false);
 });
 it("SV7A-01 typed failures carry stable codes",()=>{expect(new JobSourceError("INVALID_JOB_SOURCE_INPUT").code).toBe("INVALID_JOB_SOURCE_INPUT")});
 it("SV7A-01 exact UTF-8 originals reject unpaired surrogates rather than replacing bytes",()=>{
  for(const text of ["fictional \ud800", "\udc00 fictional"])expect(diaryInputV1.safeParse({...diary,text}).success).toBe(false);
  expect(diaryInputV1.parse({...diary,text:"\ufeffFictional café 🛠\r\n"}).text).toBe("\ufeffFictional café 🛠\r\n");
 });
});
