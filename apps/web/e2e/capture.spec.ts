import{expect,test}from"@playwright/test";
import{openCapture}from"./helpers/capture-journey";
test("walk-it shows source beside five-plus cited suggestions and an unknown rate",async({page})=>{await openCapture(page);await page.getByRole("button",{name:"Make my draft"}).click();const proposal=page.getByLabel("Cited proposal");await expect(proposal.locator("li")).toHaveCount(6);await expect(proposal).toContainText("Price needed");await expect(proposal).toContainText("Confirm disposal");await expect(proposal).toContainText("Draft only · check it first · nothing sent");await proposal.getByText("See the original words saved with this draft").click();await expect(proposal).toContainText("Practice decorating. Protect room £200.00");});
test("invalid provider output preserves original for retry",async({page})=>{await page.route("**/api/jobs/capture",route=>route.fulfill({status:422,contentType:"application/json",body:JSON.stringify({code:"INVALID_MODEL_OUTPUT",originalInputRetained:true})}));await openCapture(page);const source=page.getByLabel("Work details");await source.fill("JOB: My original\nITEM: Safe work");await page.getByRole("button",{name:"Make my draft"}).click();await expect(page.getByText(/Your original text is still here/u)).toBeVisible();await expect(source).toHaveValue(/My original/u);});

test("editing a saved capture creates a new draft while exact retries preserve both saved sources",async({page})=>{
  await openCapture(page);
  const source=page.getByLabel("Work details"),makeDraft=page.getByRole("button",{name:"Make my draft"});
  const firstText=await source.inputValue();
  async function capture(){
    const reply=page.waitForResponse(response=>response.url().endsWith("/api/jobs/capture")&&response.request().method()==="POST");
    await expect(makeDraft).toBeEnabled();await makeDraft.click();
    const response=await reply;
    expect(response.status()).toBe(201);
    await expect(page.getByText("Your draft is ready. Check it below — nothing has been sent.")).toBeVisible();
    return {body:response.request().postDataJSON(),saved:await response.json()};
  }
  const first=await capture();
  const secondText=firstText.replace("Protect room £200.00","Protect room £250.00");
  expect(secondText).not.toBe(firstText);
  await source.fill(secondText);
  await expect(page.getByRole("button",{name:"Check and edit my draft"})).toHaveCount(0);
  const second=await capture();
  expect(second.body.captureId).not.toBe(first.body.captureId);
  expect(second.saved.jobId).not.toBe(first.saved.jobId);
  expect(second.saved.source.text).toBe(secondText);
  const retry=await capture();
  expect(retry.body).toEqual(second.body);
  expect(retry.saved.jobId).toBe(second.saved.jobId);
  // Exercise the real server guard: an accidental reused ID is a 409, never a database-outage claim.
  const conflict=await page.request.post("/api/jobs/capture",{data:{...second.body,captureId:first.body.captureId}});
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toEqual({code:"CAPTURE_ID_REUSED",originalInputRetained:true});
  await source.fill(firstText);
  const originalRetry=await capture();
  expect(originalRetry.body).toEqual(first.body);
  expect(originalRetry.saved.jobId).toBe(first.saved.jobId);
  expect(originalRetry.saved.source.text).toBe(firstText);
});

for (const control of ["Stop listening", "Cancel dictation"] as const) {
  test(`pending capture keeps ${control} available for active local dictation`, async ({ page }) => {
    await page.addInitScript(() => {
      const counts = { starts: 0, stops: 0, cancels: 0 };
      Object.assign(window, { __captureSpeechCounts: counts });
      // Browser speech hardware only is faked. Capture still uses the real route.
      window.__JOBGUARD_SPEECH_ADAPTER__ = {
        configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
        available: async () => "installed", install: async () => true,
        start(callbacks) {
          counts.starts++;
          callbacks.final("Fictional dictated room. Paint walls £250.00.", "capture-voice-1");
          return {
            stop() { counts.stops++; callbacks.end(); },
            cancel() { counts.cancels++; callbacks.end(); },
          };
        },
      };
    });
    await openCapture(page);
    const source = page.getByLabel("Work details"), firstText = await source.inputValue();
    await page.getByRole("button", { name: "Talk through the example", exact: true }).click();
    await expect(page.getByText("Listening on this device", { exact: true })).toBeVisible();
    let arrive!: () => void, release!: () => void;
    const arrived = new Promise<void>(resolve => { arrive = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/jobs/capture", async route => { arrive(); await released; await route.continue(); });
    const reply = page.waitForResponse(response => response.url().endsWith("/api/jobs/capture") && response.request().method() === "POST");
    try {
      await page.getByRole("button", { name: "Make my draft", exact: true }).click();
      await arrived;
      await expect(source).toBeDisabled();
      await expect(page.getByRole("button", { name: "Use these words", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: control, exact: true })).toBeEnabled();
      await page.getByRole("button", { name: control, exact: true }).click();
      await expect(page.getByText("Listening on this device", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Talk through the example", exact: true })).toBeDisabled();
      expect(await page.evaluate(() => (window as unknown as { __captureSpeechCounts: object }).__captureSpeechCounts))
        .toEqual({ starts: 1, stops: control === "Stop listening" ? 1 : 0, cancels: control === "Cancel dictation" ? 1 : 0 });
      await expect(source).toHaveValue(firstText);
      release();
      const response = await reply;
      expect(response.status()).toBe(201);
      expect((await response.json()).source.text).toBe(firstText);
      await expect(page.getByText("Your draft is ready. Check it below — nothing has been sent.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Talk through the example", exact: true })).toBeEnabled();
    } finally { release(); await page.unroute("**/api/jobs/capture"); }
  });
}
