import { afterEach, describe, expect, it, vi } from "vitest";
import { inboundReceiveCommand, inboundItemCommand, practiceMailMatch, requireV2Inbound } from "./v2-inbound-mail.js";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const message={sender:"merchant@jobguard-v2.invalid",subject:"Invoice",body:""};
afterEach(()=>vi.unstubAllEnvs());
describe("K6A practice routing",()=>{
 it("matches an exact reference before supplier inference, holding conflicts and unknown senders",()=>{
  expect(practiceMailMatch({...message,subject:`Invoice ${b}`},[{id:a,supplier:true},{id:b,supplier:false}])).toBe(b);
  expect(practiceMailMatch({...message,body:a},[{id:a,supplier:false}])).toBe(a);
  expect(practiceMailMatch({...message,subject:`${a} ${b}`},[{id:a,supplier:true},{id:b,supplier:true}])).toBeNull();
  expect(practiceMailMatch({...message,subject:b},[{id:a,supplier:true}])).toBeNull();
  expect(practiceMailMatch({...message,sender:"unknown@jobguard-v2.invalid",body:a},[{id:a,supplier:true}])).toBeNull();
 });
 it("uses a supplier only when it identifies one visible job",()=>{
  expect(practiceMailMatch(message,[{id:a,supplier:true},{id:b,supplier:false}])).toBe(a);
  expect(practiceMailMatch(message,[{id:a,supplier:true},{id:b,supplier:true}])).toBeNull();
  expect(practiceMailMatch(message,[{id:a,supplier:false}])).toBeNull();
 });
 it("accepts attachment metadata for holding, rejects paths and URLs, and requires a filing job",()=>{
  const input={version:"v2-inbound-mail.v1",commandId:a,expectedVersion:0,recipient:"inbound@jobguard-v2.invalid",messageId:"practice-1",...message};
  expect(inboundReceiveCommand.parse({...input,attachments:[{name:"invoice.pdf"}]}).fixtureId).toBeUndefined();
  expect(inboundReceiveCommand.safeParse({...input,attachmentPath:"/private/test.pdf"}).success).toBe(false);
  expect(inboundReceiveCommand.safeParse({...input,remoteUrl:"https://example.invalid/invoice"}).success).toBe(false);
  expect(inboundItemCommand.safeParse({version:input.version,commandId:a,expectedVersion:0,itemId:b,action:"file"}).success).toBe(false);
 });
 it("is disabled outside both V2 and synthetic_demo",()=>{
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.stubEnv("JOBGUARD_LOCAL_V2","");expect(requireV2Inbound).toThrow("V2_ONLY");
  vi.stubEnv("JOBGUARD_LOCAL_V2","1");vi.stubEnv("JOBGUARD_ENV","production");expect(requireV2Inbound).toThrow("V2_ONLY");
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");expect(requireV2Inbound).not.toThrow();
 });
});
