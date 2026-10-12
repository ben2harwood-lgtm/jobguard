import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import { openLiveWatchdogJob } from "./helpers/capture-journey";
import { testTenantContext } from "../../../packages/db/test/tenant-context-test-utils";
import { withTenant } from "../../../packages/db/src/tenant-context";
const T="11111111-1111-4111-8111-111111111111";
test("I: mandatory must-surface Decision survives reload and return through Jobs",async({page})=>{
 await openLiveWatchdogJob(page);const jobId=new URL(page.url()).pathname.split('/').pop()!;
 const credential=process.env.SV3_E2E_OWNER_CREDENTIAL??["sbox","e2e","owner"].join('-');
 const admin=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:"postgres",password:credential,max:1});
 const terms=await page.request.post(`/api/jobs/${jobId}/final-account/terms`,{data:{version:"final-check-terms.accept.v1",commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"}});expect(terms.status()).toBe(200);
 const signal=randomUUID(),evidence=randomUUID(),upload=randomUUID(),firing=randomUUID(),decision=randomUUID(),disclosure=randomUUID(),login=`sv3_browser_${randomUUID().replaceAll('-','')}`,value=randomUUID();
 let shadow:Pool|undefined;
 try{
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_shadow TO ${login}`);
  shadow=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:login,password:value,max:1});
  await withTenant(admin,testTenantContext(T),async db=>{
   await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01')",[upload,T,jobId,upload]);
   await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','completion_photo',$5,'synthetic-v1',repeat('a',64),100,'image/png','standard_evidence','2026-10-01','2026-10-01')",[evidence,T,upload,jobId,upload]);
  });
  await withTenant(shadow,testTenantContext(T),async db=>{
   await db.$client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,estimated_value_pence,must_surface_now) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:I','2026-10-01','Fictional significant extra','low',800000,true)",[T,jobId,signal]);
   await db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'synthetic-v1',repeat('a',64),'2026-10-01')",[T,jobId,signal,evidence]);
  });
  await withTenant(shadow,testTenantContext(T),db=>db.$client.query("SELECT app.surface_shadow_signal_early($1,$2,$3,$4,$5,$6,'prior_written_agreement','shadow_attribution_policy_v3',$7,'synthetic-v1',$8::jsonb)",
   [T,jobId,signal,firing,decision,disclosure,evidence,JSON.stringify({workReference:"synthetic:I",scopeArea:"job",description:"Fictional significant extra",status:"requested",estimatedValuePence:800000,safetyImplication:false,customerClearlyRequested:true,needsPriorWrittenAgreement:true,significantWork:{basis:"synthetic_fixture",sourceRef:"synthetic:I",significant:true},activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false})]));
  async function verify(){await page.goto('/');await page.getByRole('button',{name:/Decisions/u}).first().click();const primary=page.getByRole('button',{name:/Fictional significant extra/u});await primary.focus();await expect(primary).toBeFocused();const target=await primary.boundingBox();expect(target!.height).toBeGreaterThanOrEqual(44);expect(target!.width).toBeGreaterThanOrEqual(44);await page.keyboard.press('Enter');await expect(page.getByTestId('decision-source-ref')).toHaveText(signal);await expect(page.locator('.decision-detail .decision-kind')).toHaveText('mandatory');await expect(page.getByRole('button',{name:'Dismiss suggestion',exact:true})).toHaveCount(0);
   const response=await page.request.get(`/api/decisions?tenantId=${T}&jobId=${jobId}`);expect(response.status()).toBe(200);expect((await response.json()).decisions).toContainEqual(expect.objectContaining({id:decision,classification:'mandatory',source:expect.objectContaining({subjectRef:signal})}));}
  await verify();await page.reload();await verify();await page.getByRole('button',{name:'← Jobs',exact:true}).click();await verify();
  await expect(page.getByText('Practice sandbox — synthetic data; nothing is sent or charged',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect((await admin.query("SELECT state,disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1",[signal])).rows).toEqual([{state:'surfaced_early',disclosed_before_lock:true}]);
 }finally{await shadow?.end();await admin.query(`DROP OWNED BY ${login};DROP ROLE ${login}`);await admin.end()}
});

test("Q: every visible count/badge/error, cache key, storage and notification surface ignores 25 linked held signals",async({page})=>{
 await openLiveWatchdogJob(page);const jobId=new URL(page.url()).pathname.split('/').pop()!;
 const credential=process.env.SV3_E2E_OWNER_CREDENTIAL??["sbox","e2e","owner"].join('-');
 const admin=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:"postgres",password:credential,max:1});
 const login=`sv3_q_browser_${randomUUID().replaceAll('-','')}`,value=randomUUID(),evidence=randomUUID(),upload=randomUUID();let shadow:Pool|undefined;
 const surfaces=["responseShape","counts","badges","errors","cacheKeys","cacheHeaders","notifications","analytics","storage"] as const;
 try{
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${value}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_shadow TO ${login}`);
  shadow=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:login,password:value,max:1});
  await withTenant(admin,testTenantContext(T),async db=>{
   await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence','2099-10-01')",[upload,T,jobId,upload]);
   await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,'original','completion_photo',$5,'Q:v1',repeat('a',64),100,'image/png','standard_evidence','2026-10-01','2026-10-01')",[evidence,T,upload,jobId,upload]);
  });
  await page.addInitScript(()=>{
   const state={notifications:[] as unknown[],cacheKeys:[] as unknown[],analytics:[] as unknown[]};Object.assign(window,{__sv3Trace:state});
   if(window.Notification){const Original=window.Notification;window.Notification=new Proxy(Original,{construct(target,args){state.notifications.push(args);return Reflect.construct(target,args)}});}
   const originalOpen=CacheStorage.prototype.open;CacheStorage.prototype.open=function(key){state.cacheKeys.push(key);return originalOpen.call(this,key)};
   const originalFetch=window.fetch;window.fetch=function(input,init){const url=String(input instanceof Request?input.url:input);state.cacheKeys.push({url,cache:init?.cache??"default"});if(/analytics|telemetry|beacon/u.test(url))state.analytics.push({url});return originalFetch.call(this,input,init)};
   const originalBeacon=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(url,data)=>{state.analytics.push({url:String(url),bytes:data instanceof Blob?data.size:null});return originalBeacon(url,data)};
  });
  const retrievalRoute=`/api/jobs/${jobId}/prevention-checks`;
  const clockPlaceholder="<retrievedAt: checked within the request window>";
  // Exact named limit: only this response's retrievedAt (top level and payingParty)
  // and its visible Retrieved: value, plus the exact date header checked below.
  // All other bytes, statuses and headers are compared.
  function checkHttpDate(value:unknown,before:number,after:number):void{
   expect(typeof value,'date header is a string').toBe('string');const at=value as string;
   expect(at,'date header is IMF-fixdate').toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u);
   const parsed=Date.parse(at);expect(Number.isFinite(parsed),'date header parses').toBe(true);
   expect(new Date(parsed).toUTCString(),'date header round-trips exactly').toBe(at);
   expect(parsed,'date header is not before the widened request window').toBeGreaterThanOrEqual(Math.floor(before/1000)*1000-1000);
   expect(parsed,'date header is not after the widened response window').toBeLessThanOrEqual(Math.floor(after/1000)*1000+1000);
  }
  function checkClock(value:unknown,before:number,after:number):string{
   expect(typeof value,'retrievedAt is a string').toBe('string');const at=value as string;
   expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
   expect(new Date(Date.parse(at)).toISOString()).toBe(at);
   expect(Date.parse(at),'retrievedAt is not before the request').toBeGreaterThanOrEqual(before);
   expect(Date.parse(at),'retrievedAt is not after the response').toBeLessThanOrEqual(after);
   return at;
  }
  function compareBody(text:string,before:number,after:number){
   const body=JSON.parse(text) as {retrievedAt?:unknown;payingParty?:{retrievedAt?:unknown}|null};
   const at=checkClock(body.retrievedAt,before,after);
   if(body.payingParty)checkClock(body.payingParty.retrievedAt,before,after);
   if(body.payingParty)expect(body.payingParty.retrievedAt).toBe(at);
   const needle=`"retrievedAt":"${at}"`;
   expect(text.split(needle).length-1,'only the two named body paths').toBe(body.payingParty?2:1);
   return {at,text:text.split(needle).join(`"retrievedAt":"${clockPlaceholder}"`)};
  }
  async function replay(){
   const responses=new Map<string,{status:number;body:string;headers:Record<string,string>}>(),pending:Promise<void>[]=[];
   const starts=new Map<import('@playwright/test').Request,number>(),retrievals:Array<{at:string;before:number;after:number}>=[];
   let visibleClocks=0;
   const requestListener=(request:import('@playwright/test').Request)=>{starts.set(request,Date.now())};
   const listener=(response:import('@playwright/test').Response)=>{
    const dateAfter=Date.now();
    const url=new URL(response.url());
    if(url.pathname.startsWith('/api/'))pending.push((async()=>{
     const dateBefore=starts.get(response.request());expect(dateBefore,'date clock reading before this request').toBeDefined();
     const headers=await response.allHeaders(),bytes=await response.body(),after=Date.now();let body=bytes.toString('base64');
     checkHttpDate(headers.date,dateBefore!,dateAfter);
     if(url.pathname===retrievalRoute){
      expect(response.status()).toBe(200);expect(headers.etag,'Next prevention-checks response has no etag').toBeUndefined();
      const before=starts.get(response.request());expect(before,'clock reading before this request').toBeDefined();
      const checked=compareBody(bytes.toString('utf8'),before!,after);
      retrievals.push({at:checked.at,before:before!,after});body=Buffer.from(checked.text).toString('base64');
     }
     responses.set(url.pathname+url.search,{status:response.status(),body,headers:Object.fromEntries(Object.entries(headers).filter(([name])=>name!=='date').sort(([a],[b])=>a.localeCompare(b)))});
    })());
   };
   page.on('request',requestListener);page.on('response',listener);
   const views:Array<{responseShape:string;counts:(string|null)[];badges:(string|null)[];errors:(string|null)[];cacheKeys:string[];notifications:unknown[];analytics:unknown[];storage:Array<Array<Array<string|null>>>}>=[];
   try{for(const route of ['/',`/jobs/${jobId}`]){
    await page.goto(route);if(route==='/'){await expect(page.getByRole('button',{name:/Decisions/u}).first()).toBeVisible();await page.getByRole('button',{name:/Decisions/u}).first().click();await expect(page.getByRole('heading',{name:'Decision Inbox'})).toBeVisible()}
    else{const price=page.getByRole('button',{name:'Price the work',exact:true});await expect(price).toBeVisible();await price.click();await expect(page.locator('.quote-editor')).toBeVisible()} // a fresh load of the job shows the scope summary first; the quote editor opens from this button, as in startWatchdogJob
    await page.waitForLoadState('networkidle');await Promise.all(pending);
    const view=await page.evaluate(()=>{
     const read=(selector:string)=>[...document.querySelectorAll(selector)].map(n=>n.textContent);
     const storage=(s:Storage)=>Object.keys(s).sort().map(key=>[key,s.getItem(key)]);
     const trace=(window as unknown as {__sv3Trace:{notifications:unknown[];cacheKeys:unknown[];analytics:unknown[]}}).__sv3Trace;
     return {responseShape:document.body.innerText,counts:read('[data-testid*="count"]'),badges:read('.nav-count,.decision-count,[class*="badge"]'),errors:read('[role="alert"]'),cacheKeys:[...new Set(trace.cacheKeys.map(v=>JSON.stringify(v)))].sort(),notifications:trace.notifications,analytics:trace.analytics,storage:[storage(localStorage),storage(sessionStorage)]};
    });
    view.responseShape=view.responseShape.replace(/(?<=Retrieved: )[^\s]+/gu,value=>{
     const retrieval=retrievals.find(r=>r.at===value);expect(retrieval,'visible Retrieved: value comes from this request').toBeDefined();
     checkClock(value,retrieval!.before,retrieval!.after);visibleClocks++;
     return clockPlaceholder;
    });
    views.push(view);
   }}finally{page.off('request',requestListener);page.off('response',listener)}
   expect(retrievals.length,'prevention-checks response was checked').toBeGreaterThan(0);
   expect(visibleClocks,'visible Retrieved: value was checked').toBeGreaterThan(0);
   expect(responses.size).toBeGreaterThan(0);
   return Object.fromEntries(surfaces.map(channel=>[channel,channel==='cacheHeaders'?[...responses].map(([url,data])=>({url,headers:data.headers})).sort((a,b)=>a.url.localeCompare(b.url)):channel==='responseShape'?{views:views.map(v=>v.responseShape),responses:[...responses].map(([url,data])=>({url,status:data.status,body:data.body})).sort((a,b)=>a.url.localeCompare(b.url))}:views.map(v=>v[channel])])) as Record<typeof surfaces[number],unknown>;
  }
  const zero=await replay();
  await withTenant(shadow,testTenantContext(T),async db=>{for(let n=0;n<25;n++){
   const signal=randomUUID();await db.$client.query("INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state) VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:Q','2026-10-01','Private fictional extra','low','held_for_final_check')",[T,jobId,signal]);
   await db.$client.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,'Q:v1',repeat('a',64),'2026-10-01')",[T,jobId,signal,evidence]);
  }});
  expect((await admin.query("SELECT count(*)::int n FROM app.shadow_signal_evidence WHERE job_id=$1 AND evidence_id=$2",[jobId,evidence])).rows).toEqual([{n:25}]);
  const many=await replay();
  for(const channel of surfaces){expect(JSON.stringify(many[channel]),channel).toBe(JSON.stringify(zero[channel]));const poisoned={...many,[channel]:{signalCount:25}};expect(()=>expect(JSON.stringify(poisoned[channel])).toBe(JSON.stringify(zero[channel]))).toThrow()}
 }finally{await shadow?.end();await admin.query(`DROP OWNED BY ${login};DROP ROLE ${login}`);await admin.end()}
});
