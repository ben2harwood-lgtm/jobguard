import { describe, expect, it } from "vitest";
import { readinessAdvanceV1, readinessPlanV1 } from "./readiness.contracts.js";
const commandId = "0b9f5a52-3c1e-4f7e-8d0a-6a1c2b3d4e5f";
const base = { version: "readiness-plan.v1", commandId, scenarioNow: "2026-10-17T08:30:00.000Z" } as const;
describe("readiness payload preservation",()=>{
 describe("RP1 resolved is a strict boolean",()=>{
  it.each([true,false])("accepts %s unchanged",(resolved)=>{
   const r=readinessPlanV1.safeParse({...base,resolved});
   expect(r.success).toBe(true);
   if(r.success) expect(r.data.resolved).toBe(resolved);
  });
  it.each([["string true","true"],["string false","false"],["empty string",""],["number 1",1],["number 0",0],["null",null],["array",[]],["object",{}]])("refuses %s",(_n,resolved)=>{
   expect(readinessPlanV1.safeParse({...base,resolved}).success).toBe(false);
  });
 });
 describe("RP2 omitted stays absent, false stays present",()=>{
  it("keeps an omitted resolved property absent",()=>{
   const r=readinessPlanV1.safeParse({...base});
   expect(r.success).toBe(true);
   if(r.success){ expect("resolved" in r.data).toBe(false); expect(Object.keys(r.data)).not.toContain("resolved"); }
  });
  it("keeps explicit false present",()=>{
   const r=readinessPlanV1.safeParse({...base,resolved:false});
   expect(r.success).toBe(true);
   if(r.success){ expect("resolved" in r.data).toBe(true); expect(r.data.resolved).toBe(false); }
  });
  it("does not make omitted and false the same payload",()=>{
   const a=readinessPlanV1.parse({...base}), b=readinessPlanV1.parse({...base,resolved:false});
   expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
 });
 describe("RP3 command id and timestamp spelling preserved, input untouched",()=>{
  it.each(["2026-10-17T08:30:00.000Z","2026-10-17T08:30:00Z"])("keeps timestamp spelling %s exactly",(scenarioNow)=>{
   const r=readinessPlanV1.safeParse({...base,scenarioNow,resolved:false});
   expect(r.success).toBe(true);
   if(r.success){ expect(r.data.scenarioNow).toBe(scenarioNow); expect(r.data.commandId).toBe(commandId); }
  });
  it("keeps the plan command id exactly",()=>{
   const upper=commandId.toUpperCase();
   const r=readinessPlanV1.safeParse({...base,commandId:upper});
   expect(r.success).toBe(true);
   if(r.success) expect(r.data.commandId).toBe(upper);
  });
  it("leaves plan input objects unchanged",()=>{
   const input={...base,resolved:false}; const snap=structuredClone(input);
   readinessPlanV1.parse(input); expect(input).toEqual(snap);
   const bare={...base}; const bareSnap=structuredClone(bare);
   readinessPlanV1.parse(bare); expect(bare).toEqual(bareSnap); expect("resolved" in bare).toBe(false);
  });
  it("preserves the advance command id and timestamp and leaves input unchanged",()=>{
   const input={version:"readiness-clock.v1",commandId,scenarioNow:"2026-10-17T08:30:00Z"}; const snap=structuredClone(input);
   const r=readinessAdvanceV1.safeParse(input);
   expect(r.success).toBe(true);
   if(r.success){ expect(r.data).toEqual(snap); expect(r.data.scenarioNow).toBe(snap.scenarioNow); }
   expect(input).toEqual(snap);
  });
 });
});
