import * as React from "react";
import { describe,expect,it,vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialJourney } from "./journey";
import { parseTrialIntent,readTrialIntent } from "./journey-model";
vi.stubGlobal("React",React);
const id="11111111-1111-4111-8111-111111111111";
describe("trial guide browser boundaries",()=>{
 it("never replays a saved request to an external or unregistered destination",()=>{
  for(const path of ["https://evil.invalid","//evil.invalid/api/jobs/x/trial","/api/subscriptions/commands","/api/small-builder-demo/reset"]){
   expect(()=>parseTrialIntent({path,body:{}})).toThrow();
  }
 });
 it("reuses original command identity and refuses injected authority or clock",()=>{
  const intent={path:"/api/small-builder-demo/trial",body:{version:"trial-demo-command.v1",action:"snapshot",commandId:id,runId:id}};
  expect(readTrialIntent(JSON.stringify(intent))).toEqual(intent);expect(readTrialIntent(null)).toBeNull();
  expect(()=>readTrialIntent("{")).toThrow();
  expect(()=>parseTrialIntent({...intent,body:{...intent.body,asOf:"2099-01-01"}})).toThrow();
 });
 it("labels absent producers, fictional money and missing terms without asserting completion",()=>{
  const html=renderToStaticMarkup(<TrialJourney/>);
  expect(html).toContain("[BEN TO SUPPLY]");expect(html).toContain("Missing capacity admission");expect(html).toContain("no live provider or money");
 });
});
