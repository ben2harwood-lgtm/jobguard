import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { readFileSync } from 'node:fs';
const hooks=vi.hoisted(()=>({cells:[] as unknown[],cursor:0,effects:[] as Array<()=>void>,focus:vi.fn()}));
// Scripted hook harness: exercises real handlers without a DOM/listening server.
// Error focus, CSS geometry and persistence are additionally asserted in both browser projects.
vi.mock('react',async importOriginal=>({...await importOriginal<typeof import('react')>(),
 useState:(initial:unknown)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=initial;return [hooks.cells[i],(value:unknown)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:unknown)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial===null?{focus:hooks.focus}:initial};return hooks.cells[i];},
 useEffect:(effect:()=>void,deps:unknown[])=>{const i=hooks.cursor++,previous=hooks.cells[i] as unknown[]|undefined;if(!previous||deps.some((dep,index)=>!Object.is(dep,previous[index])))hooks.effects.push(effect);hooks.cells[i]=deps;},
}));
vi.mock('next/link',()=>({default:'a'}));
import { ContractorAdmin } from './contractor-admin';
const id='11111111-1111-4111-8111-111111111111';
const view={version:'contractor-workspace.v1',environment:'synthetic_demo',tenantId:id,membershipId:id,revision:3,realExternalActions:0,units:[{id,kind:'branch',parent_id:null,name:'Fictional branch'}],teams:[{id,branch_id:id,name:'Fictional team'}],members:[],grants:[],teamMemberships:[],clients:[],contracts:[]};
type Node=ReactElement<{children?:ReactNode;onClick?:()=>void;onChange?:(event:{target:{value:string}})=>void;disabled?:boolean;role?:string;value?:string;href?:string;className?:string}>;
function nodes(value:ReactNode):Node[]{if(Array.isArray(value))return value.flatMap(nodes);if(!React.isValidElement(value))return [];const node=value as Node;return [node,...nodes(node.props.children)];}
function label(node:Node):string {const children=node.props.children;return typeof children==='string'?children:Array.isArray(children)?children.filter(x=>typeof x==='string').join(''):'';}
function render(){hooks.cursor=0;hooks.effects=[];return nodes(ContractorAdmin());}
function button(tree:Node[],name:string){const node=tree.find(x=>x.type==='button'&&label(x)===name);expect(node).toBeDefined();return node!;}
async function click(tree:Node[],name:string){button(tree,name).props.onClick!();await new Promise(resolve=>setImmediate(resolve));}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function focusEffects(){hooks.effects.forEach(effect=>effect());}
beforeEach(()=>{hooks.cells=[];hooks.focus.mockClear();vi.stubGlobal('React',React);});
afterEach(()=>vi.unstubAllGlobals());
describe('contractor reload and role/scope regressions',()=>{
 it.each(['STALE_REVISION','lost response','timeout','unreadable body'])('locks mutations after %s until authoritative reload succeeds',async(fault)=>{
  let failMutation=false,failReload=false;
  const fetchMock=vi.fn(async(_url:unknown,options?:{method?:string})=>{
   if(failMutation&&options?.method==='POST'){
    if(fault==='STALE_REVISION')return {ok:false,json:async()=>({code:'STALE_REVISION'})};
    if(fault==='unreadable body')return {ok:true,json:async()=>{throw new SyntaxError('Unreadable mutation response');}};
    throw new Error(fault);
   }
   if(failReload&&!options?.method)throw new Error('refresh unavailable');
   return {ok:true,json:async()=>view};
  });
  vi.stubGlobal('fetch',fetchMock);
  await click(render(),'Start generated contractor practice');
  failMutation=true;await click(render(),'Add team');let tree=render();focusEffects();
  const alert=tree.find(x=>x.props.role==='alert')!;
  expect(alert).toBeDefined();expect(label(alert)).toContain(fault==='unreadable body'?'Unreadable mutation response':fault);
  expect(hooks.focus).toHaveBeenCalled();
  for(const name of ['Add unit','Add team','Add fictional member','Add fictional client'])expect(button(tree,name).props.disabled).toBe(true);
  expect(button(tree,'Reload persisted organisation').props.disabled).toBe(false);
  const calls=fetchMock.mock.calls.length;await click(tree,'Add team');expect(fetchMock.mock.calls).toHaveLength(calls);
  failReload=true;await click(render(),'Reload persisted organisation');tree=render();focusEffects();
  expect(tree.find(x=>x.props.role==='alert')).toBeDefined();expect(button(tree,'Add team').props.disabled).toBe(true);
  failMutation=false;failReload=false;await click(tree,'Reload persisted organisation');tree=render();
  expect(tree.find(x=>x.props.role==='alert')).toBeUndefined();expect(button(tree,'Add team').props.disabled).toBe(false);
  await click(tree,'Add team');expect(label(render().find(x=>x.props.role==='status')!)).toBe('Saved to the organisation');
 });
 it('ignores an initial unauthenticated read completed after practice creation and recovers normally',async()=>{
  const initial=deferred<{ok:boolean;json:()=>Promise<unknown>}>();let firstRead=true;
  vi.stubGlobal('fetch',vi.fn(async(_url:unknown,options?:{method?:string})=>{
   if(!options?.method&&firstRead){firstRead=false;return initial.promise;}
   return {ok:true,json:async()=>view};
  }));
  let tree=render();focusEffects();await click(tree,'Start generated contractor practice');tree=render();
  expect(label(tree.find(x=>x.props.role==='status')!)).toBe('Generated organisation saved');
  initial.resolve({ok:false,json:async()=>({code:'UNAUTHENTICATED'})});await new Promise(resolve=>setImmediate(resolve));tree=render();
  expect(label(tree.find(x=>x.props.role==='status')!)).toBe('Generated organisation saved');
  expect(tree.find(x=>x.props.role==='alert')).toBeUndefined();expect(button(tree,'Add team').props.disabled).toBe(false);
  await click(tree,'Reload persisted organisation');tree=render();expect(button(tree,'Add team').props.disabled).toBe(false);
  await click(tree,'Add team');expect(label(render().find(x=>x.props.role==='status')!)).toBe('Saved to the organisation');
 });
 it('locks a previously loaded view and focuses an error after every failed manual reload, until recovery',async()=>{
  let fail=false;
  vi.stubGlobal('fetch',vi.fn(async()=>{if(fail)throw new Error('transport failure');return {ok:true,json:async()=>view};}));
  let tree=render();await click(tree,'Start generated contractor practice');tree=render();
  expect(button(tree,'Add team').props.disabled).toBe(false);
  fail=true;await click(tree,'Reload persisted organisation');tree=render();
  expect(tree.find(x=>x.props.role==='alert')).toBeDefined();
  for(const name of ['Add unit','Add team','Add fictional member','Add fictional client'])expect(button(tree,name).props.disabled).toBe(true);
  expect(label(tree.find(x=>x.props.role==='status')!)).toContain('out-of-date');
  hooks.effects.forEach(effect=>effect());expect(hooks.focus).toHaveBeenCalled();
  expect(button(tree,'Reload persisted organisation').props.disabled).toBe(false);
  fail=false;await click(tree,'Reload persisted organisation');tree=render();
  expect(tree.find(x=>x.props.role==='alert')).toBeUndefined();expect(button(tree,'Add team').props.disabled).toBe(false);
 });
 it('only offers scopes valid for the chosen role and resets the scope on role changes',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>view})));
  await click(render(),'Start generated contractor practice');
  for(const [role,expected]of [['finance',['tenant']],['client_approver',['client']],['operative',['tenant','region','branch','team']]] as const){
   let tree=render();const roleLabel=tree.find(x=>x.type==='label'&&label(x)==='Role')!;
   nodes(roleLabel.props.children).find(x=>x.type==='select')!.props.onChange!({target:{value:role}});tree=render();
   const scopeLabel=tree.find(x=>x.type==='label'&&label(x)==='Scope type')!;
   const select=nodes(scopeLabel.props.children).find(x=>x.type==='select')!;
   expect(nodes(select.props.children).filter(x=>x.type==='option').map(label)).toEqual(expected);
   expect(expected).toContain(select.props.value);
  }
 });
 it('uses the existing accessible navigation style for the Account link',()=>{
  const source=readFileSync('app/ui/jobguard-app.tsx','utf8');
  expect(source).toMatch(/<Link className="card-action" href="\/admin\/contractor">Contractor organisation practice<\/Link>/);
 });
});
