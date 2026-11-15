import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({effects:[] as (()=>unknown)[], values:[] as unknown[],writes:[] as unknown[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState:(initial:unknown)=>[f.values.length?f.values.shift():typeof initial==="function"?(initial as ()=>unknown)():initial,(value:unknown)=>f.writes.push(value)],useEffect:(effect:()=>unknown)=>f.effects.push(effect)}));
import { JobGuardApp, WalkIt } from "./jobguard-app";
beforeEach(()=>{vi.stubGlobal("React",React);f.effects=[];f.values=[];f.writes=[];});
it.each([["own",undefined,""],["example",undefined,"Paint"],["example","",""]])("preserves %s capture mode and explicit empty input",(mode,initialText,expected)=>{
  const html=renderToStaticMarkup(<WalkIt tenantId="tenant" close={()=>{}} mode={mode as "own"|"example"} {...(initialText===undefined?{}:{initialText})}/>);
  const value=html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)![1]!;
  if(expected)expect(value.length).toBeGreaterThan(0);else expect(value).toBe("");
  if(mode==="own")expect(html).toContain('placeholder=');
});
it("linked page mount reads the session without posting to the legacy start route",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({code:"UNAUTHENTICATED"})}));
  renderToStaticMarkup(<JobGuardApp blankPractice linkedPractice/>);
  await f.effects[0]!();await new Promise(resolve=>setTimeout(resolve,0));
  expect(fetch).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledWith("/api/session",{cache:"no-store"});
});

it("linked refusal displays recovery instead of an empty firm or a reset retry",()=>{
  f.values=[null,false,"",[],{mandatory:0,advisory:0,pending:0},false,null,"",false,false,false,false,false,false,false,null,false,false];
  const html=renderToStaticMarkup(<JobGuardApp blankPractice linkedPractice/>);
  expect(html).toContain("Your previous jobs have not been deleted.");
  expect(html).toContain("A reset will not be repeated.");
  expect(html).not.toContain("Ready for your first job");expect(html).not.toContain("Start the demo");
});
