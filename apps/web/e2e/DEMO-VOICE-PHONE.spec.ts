import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test.use({launchOptions:{args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream",`--use-file-for-fake-audio-capture=${resolve("e2e/fixtures/demo-voice-phone.wav")}`]}});
test.setTimeout(900_000);
async function observe(context:BrowserContext){
  const requests:{url:string;method:string;bytes:number}[]=[],sockets:string[]=[];
  // Context events include requests initiated by workers, unlike page-only listeners.
  context.on("request",r=>requests.push({url:r.url(),method:r.method(),bytes:r.postDataBuffer()?.length??0}));
  context.on("page",p=>p.on("websocket",socket=>sockets.push(socket.url())));
  return {requests,sockets};
}
const button = "Talk through the example";
test("real worker recognises fictional microphone audio locally, reviews and saves the guided draft",async({page,context,browser},info)=>{
  const observed=await observe(context);
  page.on("websocket",socket=>observed.sockets.push(socket.url()));
  await page.goto("/practice-company?name=Tommy");
  await page.getByRole("link",{name:"Walk your first practice job",exact:true}).click();
  const tour=page.getByRole("region",{name:"Guided walkthrough"});
  await tour.getByRole("button",{name:"I'll do it",exact:true}).click();
  expect(await page.evaluate(()=>window.__JOBGUARD_SPEECH_ADAPTER__)).toBeUndefined();
  expect(observed.requests.filter(r=>r.url.includes("/local-speech/"))).toEqual([]);
  const startIndex=observed.requests.length;
  const cdp=await browser.newBrowserCDPSession();let peakRendererRssKiB=0;
  const sample=async()=>{
    try {const {processInfo}=await cdp.send("SystemInfo.getProcessInfo");let rss=0;
      for(const process of processInfo.filter((p:{type:string})=>p.type==="renderer")){
        try {rss+=Number(readFileSync(`/proc/${process.id}/status`,"utf8").match(/VmRSS:\s+(\d+)/)?.[1]??0)}catch{}
      } peakRendererRssKiB=Math.max(peakRendererRssKiB,rss);
    }catch{}
  };
  const sampling=setInterval(()=>void sample(),100);
  try {
    await page.getByRole("button",{name:button,exact:true}).click();
    await expect(page.getByText("Listening on this device",{exact:true})).toBeVisible({timeout:180_000});
    await expect(page.getByLabel("Words to review")).toHaveValue(/kitchen[\s\S]*door/i,{timeout:60_000});
    await page.getByRole("button",{name:"Stop listening",exact:true}).click();
    await expect(page.getByRole("button",{name:"Stop listening",exact:true})).toHaveCount(0);
    await page.waitForTimeout(1000);await sample();clearInterval(sampling);
    const dictating=observed.requests.slice(startIndex);
    expect(dictating.some(r=>r.url.endsWith("/vosk.wasm"))).toBe(true);
    expect(dictating.some(r=>r.url.endsWith("/model.part-0"))).toBe(true);
    expect(dictating.some(r=>r.url.endsWith("/model.part-1"))).toBe(true);
    for(const request of dictating){expect(new URL(request.url).origin).toBe("http://127.0.0.1:3000");expect(request.bytes).toBe(0);expect(request.method).toBe("GET")}
    // Next dev can have its own HMR socket. No speech socket or payload is permitted.
    expect(observed.sockets.filter(url=>!url.includes("/_next/webpack-hmr")&&!url.includes("/_next/hmr"))).toEqual([]);
    const words=page.getByLabel("Words to review");const recognised=await words.inputValue();
    expect(recognised).toMatch(/kitchen/i);expect(recognised).toMatch(/door/i);
    expect(peakRendererRssKiB).toBeGreaterThan(0);
    await info.attach("local-speech-evidence",{body:JSON.stringify({recognised,peakRendererRssKiB,dictating},null,2),contentType:"application/json"});
    await words.fill("JOB: Fictional kitchen\nITEM: Paint fictional kitchen walls | £200.00");
    await page.getByRole("button",{name:"Use these words",exact:true}).click();
    await expect(page.getByLabel("Work details")).toHaveValue(/Fictional kitchen/);
    const saved=page.waitForResponse(r=>r.url().endsWith("/api/jobs/capture")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Make my draft",exact:true}).click();
    const captured=await (await saved).json();
    expect(captured.source).toMatchObject({kind:"browser_local_transcript",audioByteLength:0,acquisition:{audioUploaded:false,audioStored:false,humanEdited:true}});
    // As WALK-3: the tour reaches step 2 after the draft saves; press Show me only then.
    await expect(tour).toContainText("Step 2 of 9",{timeout:40_000});
    await tour.getByRole("button",{name:"Show me",exact:true}).click();
    await expect(tour).toContainText("Step 3 of 9",{timeout:40_000});
    await expect(page.getByRole("button",{name:"Use the prepared example job",exact:true})).toBeVisible();
    const ownHref=await page.getByRole("link",{name:"Open your saved job",exact:true}).getAttribute("href");
    expect(ownHref).toContain(captured.jobId);
    for(let step=3;step<=9;step++){
      // As WALK-3: the practice Final Check worker takes about a minute and can take longer under load.
      await expect(tour).toContainText(`Step ${step} of 9`,{timeout:300_000});
      await tour.getByRole("button",{name:"Show me",exact:true}).click();
    }
    await expect(tour).toContainText("Tour complete",{timeout:300_000});
    await expect(page).toHaveURL(/#final-account-title$/);
    await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
    const preparedHref=await page.locator('.value-page a[href^="/jobs/"]').first().getAttribute("href");
    expect(preparedHref).not.toBe(ownHref);
    // The tour's open-report panel is transient. Verify persisted report data through its canonical route.
    await page.goto(`${preparedHref}/value`);
    await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
    await page.reload();
    await expect(page.getByTestId("value-recorded-gross")).toHaveText("£1,230.00");
    const persisted=await (await page.request.get(`/api/jobs/${captured.jobId}/proposal`)).json();
    expect(persisted.source.text).toContain("Fictional kitchen");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally {clearInterval(sampling);await cdp.detach()}
});

test("no getUserMedia gives a plain typed fallback without model requests",async({page,context})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,"mediaDevices",{value:undefined,configurable:true}));
  const observed=await observe(context);
  await page.goto("/practice-company/walkthrough");
  await page.getByRole("region",{name:"Guided walkthrough"}).getByRole("button",{name:"I'll do it",exact:true}).click();
  await page.getByRole("button",{name:button,exact:true}).click();
  await expect(page.getByText("On-device voice is unavailable in this browser. Type or use the example.",{exact:true})).toBeVisible();
  await page.getByLabel("Work details").fill("Fictional typed work remains editable");
  await expect(page.getByLabel("Work details")).toHaveValue("Fictional typed work remains editable");
  expect(observed.requests.filter(r=>r.url.includes("/local-speech/"))).toEqual([]);
});

test("a model download failure preserves typed work",async({page})=>{
  // Fault injection only: no recognizer adapter or application success response is mocked.
  await page.route("**/local-speech/model.part-0",route=>route.abort("failed"));
  await page.goto("/practice-company/walkthrough");
  await page.getByRole("region",{name:"Guided walkthrough"}).getByRole("button",{name:"I'll do it",exact:true}).click();
  await page.getByLabel("Work details").fill("Fictional typed draft");
  await page.getByRole("button",{name:button,exact:true}).click();
  await expect(page.getByText("Microphone unavailable. You can type instead.",{exact:true})).toBeVisible({timeout:60_000});
  await expect(page.getByLabel("Work details")).toHaveValue("Fictional typed draft");
});

test("a same-size WASM hash mismatch preserves typing before any model download",async({page,context})=>{
  // Static-asset fault injection: retain the exact length so SHA-256 must reject it.
  const corrupt=readFileSync(resolve("public/local-speech/vosk.wasm"));
  corrupt[8]=(corrupt[8]??0)^1;
  await page.route("**/local-speech/vosk.wasm",route=>route.fulfill({status:200,contentType:"application/wasm",body:corrupt}));
  const observed=await observe(context);
  await page.goto("/practice-company/walkthrough");
  await page.getByRole("region",{name:"Guided walkthrough"}).getByRole("button",{name:"I'll do it",exact:true}).click();
  await page.getByLabel("Work details").fill("Fictional typed work survives a corrupt download");
  await page.getByRole("button",{name:button,exact:true}).click();
  await expect(page.getByText("Microphone unavailable. You can type instead.",{exact:true})).toBeVisible({timeout:60_000});
  await expect(page.getByLabel("Work details")).toHaveValue("Fictional typed work survives a corrupt download");
  expect(observed.requests.filter(r=>/\/model\.part-/u.test(r.url))).toEqual([]);
});
