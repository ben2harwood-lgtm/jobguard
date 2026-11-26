import {expect,test,type Page} from "@playwright/test";
import {openCapture} from "./helpers/capture-journey";

test.setTimeout(120_000);
const spoken=`JOB: Practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves`;

async function inject(page:Page,mode:"supported"|"downloadable"|"unsupported"|"denied"|"no-speech"="supported"){
  await page.addInitScript(({text,kind})=>{
    (window as any).__speechTest={starts:0,stops:0,cancels:0,installs:0,configuration:null};
    (window as any).__JOBGUARD_SPEECH_ADAPTER__={configuration:{language:"en-GB",processLocally:true,remoteFallback:false},available:async()=>kind==="unsupported"?"unavailable":kind==="downloadable"||kind==="denied"?"downloadable":"installed",install:async()=>{(window as any).__speechTest.installs++;if(kind==="denied")throw new DOMException("Permission denied","NotAllowedError");return true},start(callbacks:any){const state=(window as any).__speechTest;state.starts++;state.configuration=this.configuration;let closed=false;queueMicrotask(()=>{if(closed)return;if(kind==="no-speech"){callbacks.error("no-speech");return}callbacks.interim("JOB: Practice decorating");setTimeout(()=>{if(!closed){callbacks.final(text,"one");callbacks.final(text,"one")}},500)});return{stop(){closed=true;state.stops++;callbacks.end()},cancel(){closed=true;state.cancels++;callbacks.end()}}}};
  },{text:spoken,kind:mode});
}

test("local-only dictation is reviewed, persisted once, and confirmed",async({page})=>{
  await inject(page);const speechRequests:string[]=[];page.on("request",r=>{if(/speech|transcri|audio/iu.test(r.url()))speechRequests.push(r.url())});await openCapture(page);
  await page.getByRole("button",{name:"Talk through a quote",exact:true}).click();await expect(page.getByText("Listening on this device",{exact:true})).toBeVisible();await expect(page.getByTestId("interim-transcript")).toContainText("Provisional:");expect(await page.evaluate(()=>(window as any).__speechTest.configuration)).toEqual({language:"en-GB",processLocally:true,remoteFallback:false});
  await page.screenshot({path:`test-results/VOICE-1-${test.info().project.name}.png`,fullPage:true});
  const reviewed=page.getByLabel("Words to review");await expect(reviewed).toHaveValue(spoken);await reviewed.fill(`${spoken}\n`);await page.getByRole("button",{name:"Use these words"}).click();await expect(page.getByLabel("Work details")).toHaveValue(`${spoken}\n`);
  const responsePromise=page.waitForResponse(r=>r.url().endsWith("/api/jobs/capture")&&r.request().method()==="POST");await page.getByRole("button",{name:"Make my draft"}).click();const response=await responsePromise;const body=await response.json();expect(body.source).toMatchObject({kind:"browser_local_transcript",text:`${spoken}\n`,audioByteLength:0,acquisition:{processLocally:true,audioUploaded:false,audioStored:false,humanEdited:true}});expect(speechRequests).toEqual([]);
  await page.getByRole("button",{name:"Check and edit my draft"}).click();for(const name of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await page.getByRole("button",{name:`Accept ${name}`}).click();await page.getByRole("button",{name:"Dismiss Replace shelves"}).click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this practice quote");await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");await page.getByRole("button",{name:"Confirm scope"}).click();await page.reload();await expect(page.getByTestId("capture-method")).toHaveText("On-device dictation · checked by you");
});

test("unsupported browser keeps typed fallback usable",async({page})=>{await inject(page,"unsupported");await openCapture(page);await expect(page.getByText("Voice doesn't work in this browser. Type the job below. It works the same way.",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Talk through a quote",exact:true})).toBeDisabled();await page.getByLabel("Work details").fill("Typed work remains");await expect(page.getByLabel("Work details")).toHaveValue("Typed work remains")});

const refusals={
  denied:"JobGuard can't use your microphone. To allow it, open this site's settings from the address bar, allow Microphone, then press Talk through a quote again. You can type the job below instead.",
  "no-speech":"We didn't hear anything. Press Talk through a quote to try again, or type below.",
} as const;
for(const mode of ["denied","no-speech"] as const)test(`${mode} explains what happened, preserves typed work and still saves a typed draft`,async({page})=>{
  await inject(page,mode);const speechRequests:string[]=[];page.on("request",r=>{if(/speech|transcri|audio/iu.test(r.url()))speechRequests.push(r.url())});await openCapture(page);
  await page.getByLabel("Work details").fill(spoken);await page.getByRole("button",{name:"Talk through a quote",exact:true}).click();
  await expect(page.getByText(refusals[mode],{exact:true})).toBeVisible();await expect(page.getByLabel("Work details")).toHaveValue(spoken);
  const state=await page.evaluate(()=>(window as any).__speechTest);
  if(mode==="denied"){expect(state.installs).toBe(1);expect(state.starts).toBe(0)}else expect(state.cancels).toBeGreaterThan(0);
  // A second try stays possible after any failure.
  await expect(page.getByRole("button",{name:"Talk through a quote",exact:true})).toBeEnabled();
  await page.screenshot({path:`test-results/VOICE-1-${mode}-${test.info().project.name}.png`,fullPage:true});
  const responsePromise=page.waitForResponse(r=>r.url().endsWith("/api/jobs/capture")&&r.request().method()==="POST");await page.getByRole("button",{name:"Make my draft"}).click();
  const body=await (await responsePromise).json();expect(body.source).toMatchObject({kind:"text",text:spoken});expect(speechRequests).toEqual([]);
});

test("one press asks for the microphone, loads the voice model and starts listening",async({page})=>{
  await inject(page,"downloadable");const speechRequests:string[]=[];page.on("request",r=>{if(/speech|transcri|audio/iu.test(r.url()))speechRequests.push(r.url())});await openCapture(page);
  await expect(page.getByText("Uses your microphone on this phone or computer. The voice model (42.4 MiB) downloads once, the first time. Nothing you say leaves this device.",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Install on-device voice"})).toHaveCount(0);
  await page.getByRole("button",{name:"Talk through a quote",exact:true}).click();
  await expect(page.getByText("Listening on this device",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>{const state=(window as any).__speechTest;return {installs:state.installs,starts:state.starts}})).toEqual({installs:1,starts:1});
  await expect(page.getByLabel("Words to review")).toHaveValue(spoken);await expect(page.getByLabel("Work details")).toBeEnabled();
  await page.screenshot({path:`test-results/VOICE-1-one-press-${test.info().project.name}.png`,fullPage:true});expect(speechRequests).toEqual([]);
});

test("cancel and navigation clear provisional words and stop recognition",async({page})=>{await inject(page);await openCapture(page);await page.getByRole("button",{name:"Talk through a quote",exact:true}).click();await page.getByRole("button",{name:"Cancel dictation"}).click();await expect(page.getByTestId("interim-transcript")).toHaveCount(0);await page.getByRole("button",{name:"Talk through a quote",exact:true}).click();await page.getByRole("button",{name:"← Back to jobs"}).click();expect(await page.evaluate(()=>(window as any).__speechTest.cancels)).toBeGreaterThanOrEqual(2)});
