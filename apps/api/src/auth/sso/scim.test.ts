import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ScimRepository, ScimRepositoryError } from "@jobguard/db";
import { ScimApplication } from "./scim.application.js";
import { ScimError, scimBearerFor, scimBearerProved, scimDeactivationV1, scimDeactivationResultV1, scimSeed, scimStatus, scimUnparsedBody } from "./scim.contracts.js";
import type { DeploymentMode } from "@jobguard/config";
const connectionId=randomUUID(),other=randomUUID();
const body=()=>({version:"scim-deactivation.v1",eventId:randomUUID(),subject:"synthetic-person",active:false});
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
function fixture(mode:DeploymentMode="synthetic_demo",configured?:string) {
 const seed=configured??randomBytes(32).toString("base64url");
 const repository={deactivate:vi.fn().mockResolvedValue({outcome:"deactivated",cause:"SCIM_DEACTIVATED",recordId:randomUUID(),replayed:false}),refusal:vi.fn().mockResolvedValue(undefined)};
 return {seed,repository,service:new ScimApplication(repository,mode,seed),header:['Bearer',scimBearerFor(seed,connectionId)].join(' ')};
}
export const refusedCases=["missing","empty","Basic","lowercase","wrong shape value","changed character","trailing space","trailing newline","second word","other connection","other seed","seed presented","invalid connection","unset","pilot","production","missing mode","owner cookie only","admin cookie only"] as const;
export function negative(name:typeof refusedCases[number],seed:string,id:string):{mode:DeploymentMode;seed:string;id:string;header:string|undefined} {
 const bearer=scimBearerFor(seed,id),header=['Bearer',bearer].join(' ');
 let presented:string|undefined=header,mode:DeploymentMode="synthetic_demo",configured=seed,target=id;
 switch(name) {
 case "missing":case "owner cookie only":case "admin cookie only":presented=undefined;break;
 case "empty":presented='';break;
 case "Basic":presented=['Basic',bearer].join(' ');break;
 case "lowercase":presented=['bearer',bearer].join(' ');break;
 case "wrong shape value":presented=['Bearer','x'.repeat(43)].join(' ');break;
 case "changed character":presented=['Bearer',(bearer[0]==='x'?'y':'x')+bearer.slice(1)].join(' ');break;
 case "trailing space":presented=header+' ';break;
 case "trailing newline":presented=header+"\n";break;
 case "second word":presented=header+' extra';break;
 case "other connection":presented=['Bearer',scimBearerFor(seed,other)].join(' ');break;
 case "other seed":presented=['Bearer',scimBearerFor(randomBytes(32).toString('base64url'),id)].join(' ');break;
 case "seed presented":presented=['Bearer',seed].join(' ');break;
 case "invalid connection":target='invalid';presented=['Bearer',scimBearerFor(seed,target)].join(' ');break;
 case "unset":configured='unset';break;
 case "pilot":mode='pilot_no_charge';break;
 case "production":mode='production_billing';break;
 case "missing mode":mode=undefined as unknown as DeploymentMode;break;
 }
 return {mode,seed:configured,id:target,header:presented};
}
describe('synthetic SCIM boundary',()=>{
 it('[A1] accepts only the bounded installation setting and derives one bearer per connection',async()=>{
  for(const length of [43,200]) {const value='a'.repeat(length);expect(scimSeed(value)).toBe(value);}
  for(const value of [undefined,'','a'.repeat(42),'a'.repeat(201),'a'.repeat(43)+' ','a'.repeat(43)+'.','a'.repeat(43)+'/','a'.repeat(43)+'\n',42,null])expect(scimSeed(value)).toBe('unset');
  const seed=randomBytes(32).toString('base64url'),bearer=scimBearerFor(seed,connectionId);
  expect(bearer).toMatch(/^[A-Za-z0-9_-]{43}$/u);expect(scimBearerFor(seed,other)).not.toBe(bearer);
  expect(scimBearerFor(randomBytes(32).toString('base64url'),connectionId)).not.toBe(bearer);
  expect(scimBearerFor(seed,connectionId.toUpperCase())).toBe(bearer);
  expect(scimBearerProved(seed,connectionId,['Bearer',bearer].join(' '))).toBe(true);
  const f=fixture('synthetic_demo','unset');await expect(f.service.deactivate(connectionId,f.header,body())).rejects.toMatchObject({code:'SCIM_REFUSED'});
 });
 it.each(refusedCases)('[A2] %s has one global refusal and no lookup',async name=>{
  const seed=randomBytes(32).toString('base64url'),input=negative(name,seed,connectionId),f=fixture(input.mode,input.seed);
  const error=await new ScimApplication(f.repository,input.mode,input.seed).deactivate(input.id,input.header,body()).catch(e=>e);
  expect(scimStatus(error)).toEqual({code:'SCIM_REFUSED',status:403});expect(error.message).toBe('SCIM_REFUSED');
  expect(f.repository.deactivate).not.toHaveBeenCalled();expect(f.repository.refusal).toHaveBeenCalledTimes(1);expect(f.repository.refusal.mock.calls[0]?.[0]).toBe('scim');
 });
 it('[A2] a global refusal insert failure keeps the identical public refusal',async()=>{
  const f=fixture();f.repository.refusal.mockRejectedValue(new Error('internal unavailable'));
  await expect(f.service.deactivate(connectionId,undefined,body())).rejects.toMatchObject({code:'SCIM_REFUSED',message:'SCIM_REFUSED'});
  expect(f.repository.refusal).toHaveBeenCalledTimes(1);expect(f.repository.deactivate).not.toHaveBeenCalled();
 });
 const invalids:Array<[string,(b:ReturnType<typeof body>)=>unknown]>=[
  ['unknown',b=>({...b,extra:1})],['reactivation',b=>({...b,active:true})],['active missing',b=>{const {active:_a,...rest}=b;return rest;}],
  ['event missing',b=>{const {eventId:_i,...rest}=b;return rest;}],['event invalid',b=>({...b,eventId:'invalid'})],['empty subject',b=>({...b,subject:''})],['long subject',b=>({...b,subject:'s'.repeat(201)})],
  ...['tenantId','requested_tenant_id','connectionId','membershipId','userId','email','role','outcome','createdAt'].map(name=>[name,(b:ReturnType<typeof body>)=>({...b,[name]:'invalid'})] as [string,(b:ReturnType<typeof body>)=>unknown]),
  ['array',()=>[]],['string',()=> 'invalid'],['unparsed',()=>scimUnparsedBody],
 ];
 it.each(invalids)('[A4] proved caller invalid input: %s',async(_name,make)=>{
  const f=fixture(),raw=make(body());expect(scimDeactivationV1.safeParse(raw).success).toBe(false);
  const error=await f.service.deactivate(connectionId,f.header,raw).catch(e=>e);
  expect(scimStatus(error)).toEqual({code:'INVALID_SCIM_INPUT',status:400});expect(f.repository.deactivate).not.toHaveBeenCalled();expect(f.repository.refusal).toHaveBeenCalledExactlyOnceWith(connectionId,'INVALID_SCIM_INPUT');
 });
 it('[A4] repository sends only the canonical hashes and appends audit last',async()=>{
  const calls:Array<[string,unknown[]]>=[],recordId=randomUUID(),raw=body();
  const client={query:vi.fn(async(sql:string,args:unknown[]=[])=>{calls.push([sql,args]);return {rows:sql.includes('scim_deactivate')?[{result:{outcome:'deactivated',cause:'SCIM_DEACTIVATED',recordId,replayed:false}}]:[]};}),release:vi.fn()};
  const pool={connect:async()=>client} as unknown as Pool,repo=new ScimRepository(pool);
  const audit=vi.spyOn(repo.enterprise,'audit').mockImplementation(async()=>{calls.push(['audit',[]]);});
  const result=await repo.deactivate(connectionId.toUpperCase(),raw);
  const subjectHash=digest(raw.subject),eventHash=digest(JSON.stringify({active:false,connectionId:connectionId.toLowerCase(),eventId:raw.eventId.toLowerCase(),subjectHash,version:raw.version}));
  expect(calls).toEqual([['BEGIN',[]],['SELECT identity.scim_deactivate($1,$2::jsonb) result',[connectionId.toLowerCase(),JSON.stringify({version:raw.version,eventId:raw.eventId.toLowerCase(),subjectHash,eventHash})]],['audit',[]],['COMMIT',[]]]);
  expect(audit).toHaveBeenCalledExactlyOnceWith(client,connectionId.toLowerCase(),'sso.scim.deactivated','identity:scim','SCIM_DEACTIVATED',eventHash);expect(result.recordId).toBe(recordId);
  for(const value of calls.flatMap(([,args])=>args))expect(String(value)).not.toContain(raw.subject);
 });
 it.each(['SCIM_EVENT_CONFLICT','INVALID_SCIM_INPUT','SCIM_ROUTE_BLOCKED','SSO_ROUTE_BLOCKED','SSO_NOT_FOUND'] as const)('[A5] repository translates exact routine cause %s only',async message=>{
  const client={query:vi.fn(async(sql:string)=>{if(sql.includes('scim_deactivate'))throw new Error(message);return {rows:[]};}),release:vi.fn()};
  await expect(new ScimRepository({connect:async()=>client} as unknown as Pool).deactivate(connectionId,body())).rejects.toMatchObject({code:message,message});
  expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
 });
 it.each(['SCIM_EVENT_CONFLICT','INVALID_SCIM_INPUT','SSO_NOT_FOUND','SSO_ROUTE_BLOCKED','SCIM_ROUTE_BLOCKED','SCIM_UNAVAILABLE'] as const)('[A5] application maps proved repository failure %s without internal data',async code=>{
  const f=fixture();f.repository.deactivate.mockRejectedValue(new ScimRepositoryError(code,{cause:new Error('PostgreSQL internal detail')}));
  const error=await f.service.deactivate(connectionId,f.header,body()).catch(e=>e),publicCode=['SSO_NOT_FOUND','SSO_ROUTE_BLOCKED','SCIM_ROUTE_BLOCKED'].includes(code)?'SCIM_REFUSED':code;
  expect(scimStatus(error).code).toBe(publicCode);expect(error.message).toBe(publicCode);
  expect(JSON.stringify(f.repository.refusal.mock.calls)).not.toContain('PostgreSQL');
  if(publicCode==='SCIM_REFUSED')expect(f.repository.refusal.mock.calls[0]?.[0]).toBe('scim');
 });
 it('[A5] unexpected proved error is unavailable and pre-service error is refused',async()=>{
  const f=fixture();f.repository.deactivate.mockRejectedValue(new Error('PostgreSQL internal detail'));
  const error=await f.service.deactivate(connectionId,f.header,body()).catch(e=>e);
  expect(scimStatus(error)).toEqual({code:'SCIM_UNAVAILABLE',status:503});expect(error.message).toBe('SCIM_UNAVAILABLE');
  expect(scimStatus(new Error('PostgreSQL internal detail'))).toEqual({code:'SCIM_REFUSED',status:403});
 });
 it('[A5] closed statuses and result schema refuse unknown or mismatched outcomes',()=>{
  for(const [code,status] of [['SCIM_REFUSED',403],['INVALID_SCIM_INPUT',400],['SCIM_EVENT_CONFLICT',409],['SCIM_UNAVAILABLE',503]] as const)expect(scimStatus(new ScimError(code))).toEqual({code,status});
  const result={version:'scim-deactivation-result.v1',environment:'synthetic_demo',eventId:randomUUID(),outcome:'deactivated',cause:'SCIM_DEACTIVATED'};
  expect(scimDeactivationResultV1.safeParse(result).success).toBe(true);
  for(const extra of [{extra:1},{outcome:'invalid'},{cause:'invalid'},{cause:'SCIM_OWNER_PROTECTED'}])expect(scimDeactivationResultV1.safeParse({...result,...extra}).success).toBe(false);
 });
 it('[B7] owned migration contains only two one-way updates and no reset',async()=>{
  const sql=await readFile(new URL('../../../../../packages/db/migrations/0137_scim_deactivation.sql',import.meta.url),'utf8');
  const updates=sql.match(/UPDATE\s+(?:app\.membership|identity\.session)\s+SET\s+revoked_at\s*=\s*changed_at[\s\S]*?;/giu)??[];
  expect(updates).toHaveLength(2);for(const update of updates)expect(update).toMatch(/revoked_at IS NULL/iu);
  expect(sql).not.toMatch(/SET\s+revoked_at\s*=\s*NULL|\bDELETE FROM\b|\bTRUNCATE\b/iu);
 });
});
