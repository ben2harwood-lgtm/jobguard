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
type Node=ReactElement<{children?:ReactNode;onClick?:()=>void;onChange?:(event:{target:{value:string}})=>void;disabled?:boolean;role?:string;value?:string;href?:string;className?:string;'data-testid'?:string}>;
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
  await mount();
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
  const initial=deferred<{ok:boolean;json:()=>Promise<unknown>}>();let reads=0;
  vi.stubGlobal('fetch',vi.fn(async(_url:unknown,options?:{method?:string})=>{
   if(!options?.method){reads++;if(reads===1)return unauth();if(reads===2)return initial.promise;}
   return {ok:true,json:async()=>view};
  }));
  render();const mountEffects=[...hooks.effects];focusEffects();await settle();let tree=render();mountEffects.forEach(effect=>effect());await click(tree,'Start generated contractor practice');tree=render();
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
  let tree=await mount();
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
  await mount();
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

const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function mount(){render();focusEffects();await settle();return render();}
const ok=(value:unknown)=>({ok:true,json:async()=>value});
const unauth=()=>({ok:false,json:async()=>({code:'UNAUTHENTICATED'})});
const sessionPosts=(mock:ReturnType<typeof vi.fn>)=>mock.mock.calls.filter(([url,options])=>url==='/api/session'&&options?.method==='POST');
const tenant=(tree:Node[])=>label(tree.find(x=>x.props['data-testid']==='contractor-tenant')!);
describe('session-preserving practice recovery',()=>{
 it.each(['transport abort','DATABASE_UNAVAILABLE','unreadable body'])('recovers the first-load %s by reading the same session, with no session POST',async fault=>{
  let outage=true;
  const fetchMock=vi.fn(async(url:unknown)=>{
   if(url==='/api/contractor'&&outage){
    if(fault==='DATABASE_UNAVAILABLE')return {ok:false,json:async()=>({code:fault})};
    if(fault==='unreadable body')return {ok:true,json:async()=>{throw new SyntaxError('unreadable');}};
    throw new Error(fault);
   }
   return ok(view);
  });vi.stubGlobal('fetch',fetchMock);
  let tree=await mount();focusEffects();
  expect(label(tree.find(x=>x.props.role==='status')!)).toBe('The persisted organisation could not be loaded.');
  expect(tree.find(x=>x.type==='button'&&label(x)==='Start generated contractor practice')).toBeUndefined();
  expect(button(tree,'Reload persisted organisation').props.disabled).toBe(false);expect(hooks.focus).toHaveBeenCalled();
  outage=false;await click(tree,'Reload persisted organisation');tree=render();
  expect(tenant(tree)).toBe(view.tenantId);expect(tree.find(x=>x.props['data-testid']==='contractor-revision')!.props.children).toBe(view.revision);
  expect(sessionPosts(fetchMock)).toHaveLength(0);expect(fetchMock.mock.calls.map(([url])=>url)).toEqual(['/api/contractor','/api/contractor']);
 });
 it('does not offer Start while the first read is pending',async()=>{
  const pending=deferred<ReturnType<typeof unauth>>();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));
  let tree=render();focusEffects();expect(tree.find(x=>x.type==='button'&&label(x)==='Start generated contractor practice')).toBeUndefined();
  pending.resolve(unauth());await settle();tree=render();expect(button(tree,'Start generated contractor practice').props.disabled).toBe(false);
 });
 it('starts with an existing session without replacing its cookie',async()=>{
  const fetchMock=vi.fn(async(url:unknown)=>url==='/api/contractor'?unauth():ok(view));vi.stubGlobal('fetch',fetchMock);
  await click(await mount(),'Start generated contractor practice');expect(tenant(render())).toBe(id);
  expect(sessionPosts(fetchMock)).toHaveLength(0);expect(fetchMock.mock.calls.map(([url])=>url)).toEqual(['/api/contractor','/api/contractor?action=start']);
 });
 it.each([false,true])('reconciles a committed start after response loss (began without session: %s)',async fresh=>{
  for(const fault of ['transport abort','unreadable body']){
   hooks.cells=[];hooks.focus.mockClear();let hasSession=!fresh,persisted:typeof view|null=null;
   const fetchMock=vi.fn(async(url:unknown)=>{
    if(url==='/api/session'){hasSession=true;return ok({});}
    if(url==='/api/contractor')return persisted?ok(persisted):unauth();
    if(!hasSession)return unauth();
    persisted=view;
    if(fault==='unreadable body')return {ok:true,json:async()=>{throw new SyntaxError('unreadable');}};
    throw new Error('transport abort');
   });vi.stubGlobal('fetch',fetchMock);
   await click(await mount(),'Start generated contractor practice');let tree=render();focusEffects();
   expect(label(tree.find(x=>x.props.role==='status')!)).toContain('Practice start was not confirmed');expect(hooks.focus).toHaveBeenCalled();
   expect(tree.find(x=>x.type==='button'&&label(x)==='Start generated contractor practice')).toBeUndefined();
   await click(tree,'Reload persisted organisation');tree=render();expect(tenant(tree)).toBe(persisted!.tenantId);
   expect(sessionPosts(fetchMock)).toHaveLength(fresh?1:0);
   expect(fetchMock.mock.calls.map(([url])=>url)).toEqual(fresh?['/api/contractor','/api/contractor?action=start','/api/session','/api/contractor?action=start','/api/contractor']:['/api/contractor','/api/contractor?action=start','/api/contractor']);
   // A full remount reads the same server tenant; it never starts another practice.
   hooks.cells=[];tree=await mount();expect(tenant(tree)).toBe(id);expect(sessionPosts(fetchMock)).toHaveLength(fresh?1:0);
  }
 });
 it('never repeats session bootstrap after its outcome is unknown, even after another unauthenticated read',async()=>{
  const fetchMock=vi.fn(async(url:unknown)=>{if(url==='/api/session')throw new Error('session response lost');return unauth();});vi.stubGlobal('fetch',fetchMock);
  await click(await mount(),'Start generated contractor practice');let tree=render();
  expect(label(tree.find(x=>x.props.role==='status')!)).toContain('Practice start was not confirmed');expect(sessionPosts(fetchMock)).toHaveLength(1);
  await click(tree,'Reload persisted organisation');await click(render(),'Start generated contractor practice');tree=render();
  expect(label(tree.find(x=>x.props.role==='status')!)).toContain('Practice start was not confirmed');expect(sessionPosts(fetchMock)).toHaveLength(1);
 });
 it('focuses each identical invalid-rules rejection without submitting a command',async()=>{
  const fetchMock=vi.fn(async()=>ok({...view,clients:[{id,name:'Fictional client',branch_id:id}]}));vi.stubGlobal('fetch',fetchMock);
  let tree=await mount();const draft=tree.find(x=>x.type==='textarea')!;draft.props.onChange!({target:{value:'{broken'}});
  for(let attempt=1;attempt<=2;attempt++){
   await click(render(),'Save contract version');tree=render();focusEffects();expect(label(tree.find(x=>x.props.role==='alert')!)).toBe('INVALID_RULE_DOCUMENT');expect(hooks.focus).toHaveBeenCalledTimes(attempt);
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
 });
 it('focuses each identical start rejection, including after a recovery read',async()=>{
  const fetchMock=vi.fn(async(url:unknown)=>url==='/api/contractor'?unauth():({ok:false,json:async()=>({code:'INVALID_COMMAND'})}));vi.stubGlobal('fetch',fetchMock);
  let tree=await mount();
  for(let attempt=1;attempt<=2;attempt++){
   await click(tree,'Start generated contractor practice');tree=render();focusEffects();expect(label(tree.find(x=>x.props.role==='alert')!)).toBe('INVALID_COMMAND');expect(hooks.focus).toHaveBeenCalledTimes(attempt);
   if(attempt===1){await click(tree,'Reload persisted organisation');tree=render();}
  }
  expect(sessionPosts(fetchMock)).toHaveLength(0);
 });
});
