import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { draftSaveAndReopen, openNewJob, pinnedFixture } from "./helpers/spoken-quote-journey";

// V2-SQ3 (Q61): real speech in, saved quote out. The built-in Vosk worker hears a synthetic recording through
// Chromium's fake microphone. There is no injected adapter, no transcript rewrite and no fill before "Make my draft".
// The audio source is a recording, not a live microphone; Ben's own phone run stays a separate step.
const wav = "e2e/fixtures/spoken-quote-real.wav";
const wavSha256 = "bcc8e2c69b0d3c3af50044df03a9a363f8afeeeaf7d8bc45c7bdaa419c9e05ce";
const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${resolve(wav)}`];
test.use({ launchOptions: { args } });
test.setTimeout(900_000);
// Pinned from local runs of this recording (fixtures README). Money, quantity and unit words are strict: any drift
// there fails. A description may only differ by a variant named here; anything else fails too, never absorbed.
const DESCRIPTION_VARIANTS = {
  first: ["remove the old kitchen", "removed the old kitchen"],
  third: ["tile the bathroom floor", "tiled the bathroom floor"],
} as const;
const heard = (first: string, third: string) => `${first} for four hundred pounds fit six new doors and ${third} for two hundred pounds`;
const accepted = DESCRIPTION_VARIANTS.first.flatMap(first => DESCRIPTION_VARIANTS.third.map(third => ({ first, third, words: heard(first, third) })));

test("a recorded spoken job goes through the real on-device recogniser to a saved quote that reopens unchanged", async ({ page, context }) => {
  pinnedFixture(wav, wavSha256);
  test.info().annotations.push({ type: "audio-source", description: `recording ${wav} sha256 ${wavSha256}; Flite 2.2 slt voice, synthetic` },
    { type: "launch-args", description: args.join(" ") });
  const requests: { url: string; method: string; bytes: number }[] = [];
  context.on("request", request => requests.push({ url: request.url(), method: request.method(), bytes: request.postDataBuffer()?.length ?? 0 }));
  await openNewJob(page);
  expect(await page.evaluate(() => (window as any).__JOBGUARD_SPEECH_ADAPTER__)).toBeUndefined();
  const words = page.getByLabel("Words to review");
  // The fake microphone loops the file from when it opens. If the model came up mid-sentence, the first words are
  // partial: cancel and press again, as a builder would. The recognised words are never edited.
  for (let attempt = 1; ; attempt++) {
    await page.getByRole("button", { name: "Talk through a quote", exact: true }).click();
    await expect(page.getByText("Listening on this device", { exact: true })).toBeVisible({ timeout: 180_000 });
    await expect(words).toHaveValue(/two hundred pounds$/u, { timeout: 120_000 });
    if (/^removed? /u.test(await words.inputValue()) || attempt === 2) break;
    await page.getByRole("button", { name: "Cancel dictation", exact: true }).click();
  }
  await page.getByRole("button", { name: "Stop listening", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop listening", exact: true })).toHaveCount(0);
  const recognised = await words.inputValue();
  const match = accepted.find(variant => variant.words === recognised);
  expect(match, `recogniser drift: "${recognised}"`).toBeDefined();
  const { first, third } = match!;
  await page.getByRole("button", { name: "Use these words", exact: true }).click();
  const capture = await draftSaveAndReopen(page, {
    words: recognised, shot: `SPOKEN-QUOTE-REAL-${test.info().project.name}`,
    rows: [
      { description: first, quantity: "1", unit: "item", price: "400.00" },
      { description: "fit six new doors", quantity: "6", unit: "new doors", price: "", fill: "50" },
      { description: third, quantity: "1", unit: "item", price: "200.00" },
    ],
    before: "Total so far £600.00 · incomplete: 1 row needs a price", after: "Total so far £900.00 · complete", net: "GBP 900.00",
  });
  expect(capture.source.kind).toBe("browser_local_transcript");
  // The saved source is the recogniser's words, untouched by the builder before the draft.
  expect(capture.source).toMatchObject({ kind: "browser_local_transcript", text: recognised, audioByteLength: 0,
    acquisition: { processLocally: true, audioUploaded: false, audioStored: false, humanEdited: false } });
  await page.goto(`/jobs/${capture.jobId}/work`);
  await expect(page.getByTestId("capture-method")).toHaveText("On-device dictation · checked by you");
  // Speech assets are bodyless same-origin GETs; nothing else about speech, transcripts or audio leaves the page.
  const speech = requests.filter(r => /speech|transcri|audio/iu.test(r.url));
  expect(speech.some(r => r.url.endsWith("/local-speech/model.part-1"))).toBe(true);
  for (const r of speech) { expect(new URL(r.url).pathname).toMatch(/^\/local-speech\//u); expect(r.method).toBe("GET"); expect(r.bytes).toBe(0); }
  await test.info().attach("spoken-quote-real-evidence", { contentType: "application/json",
    body: JSON.stringify({ wav, wavSha256, args, recognised, jobId: capture.jobId, captureId: capture.captureId }, null, 2) });
});
