import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";

const corpus = JSON.parse(readFileSync(new URL("./corpus/RT-06-limits-and-noise.v1.json", import.meta.url), "utf8")) as { id: string; transcript: string }[];
const fromCorpus = (id: string) => {
  const item = corpus.find(row => row.id === id);
  if (!item) throw new Error(`Missing RT-06 perf input ${id}`);
  return item.transcript;
};
const fill = (text: string) => text.repeat(Math.ceil(49_970 / text.length)).slice(0, 49_970);
const attacks = [
  ...["RT-06-075", "RT-06-076", "RT-06-077", "RT-06-078"].map(id => ({ id, text: fromCorpus(id), profile: false })),
  { id: "number-words", text: `Fit panel ${fill("one hundred and ")} end`, profile: true },
  { id: "and-chain", text: `Fit panel ${fill("and ")} end`, profile: true },
  { id: "comma-digits", text: `Fit panel £${fill("1,111,")}x`, profile: false },
  { id: "between-chain", text: `Fit panel ${fill("between one and ")}£50`, profile: true },
  { id: "room-chain", text: `Fit panel ${fill("kitchen bedroom bathroom ")} end`, profile: true },
  { id: "hyphen-words", text: `Fit panel ${fill("one-hundred-and-")} end`, profile: true },
];
const openFindings: Record<string, string> = {
  "RT-06-078": "RT-06-F002", "and-chain": "RT-06-F005",
  "number-words": "RT-06-F003", "comma-digits": "RT-06-F004",
};
type Sample = { regex: string; totalMs: number; maxMs: number; calls: number };
type Result = { timings: { path: string; ms: number; lines: number }[]; samples: Sample[]; timedOut: boolean; activePath?: string };
async function measure(text: string, profile: boolean): Promise<Result> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./perf-worker.mjs", import.meta.url), { workerData: { text, profile } });
    const result: Result = { timings: [], samples: [], timedOut: false };
    const timer = setTimeout(() => {
      result.timedOut = true;
      void worker.terminate().then(() => resolve(result), reject);
    }, 15_000);
    worker.on("message", message => {
      if (message.event === "started") result.activePath = message.path;
      if (message.event === "timing") result.timings.push(message);
      if (message.event === "profile") result.samples = message.samples;
    });
    worker.on("error", error => { clearTimeout(timer); reject(error); });
    worker.on("exit", code => {
      clearTimeout(timer);
      if (result.timedOut) return;
      if (code !== 0) reject(new Error(`RT-06 perf worker exited ${code}`));
      else resolve(result);
    });
  });
}

describe("RT-06 bounded readers and regex attacks", () => {
  for (const attack of attacks) {
    const finding = openFindings[attack.id];
    const status = finding ? "open-finding" : "pass";
    it(`${attack.id} [${status}${finding ? ` ${finding}` : ""}]: each reader <1s; regex call <50ms`, async () => {
      expect(attack.text.length).toBeLessThanOrEqual(50_000);
      const result = await measure(attack.text, attack.profile);
      // Worker import/runtime errors reject above; an open budget finding must
      // never hide a harness error or a timeout before a reader actually starts.
      if (result.timedOut && !result.activePath) throw new Error("Worker never started a reader");
      if (!result.timedOut) expect(result.timings.map(timing => timing.path)).toEqual(["capture", "reader"]);
      const failures = result.timings.filter(timing => timing.ms >= 1_000).map(timing => `${timing.path} >=1s`);
      if (result.timedOut) failures.push(`${result.activePath}: 15s watchdog`);
      for (const sample of result.samples) if (sample.maxMs >= 50) failures.push(`regex >=50ms: ${sample.regex}`);
      process.stdout.write(JSON.stringify({ attack: attack.id, status, finding, length: attack.text.length,
        ...result, samples: result.samples.slice(0, 4).map(sample => ({ ...sample, regex: sample.regex.slice(0, 140) })),
      }) + "\n");
      if (status === "open-finding") expect(failures, `${finding} now passes: close the finding and set pass`).not.toEqual([]);
      else expect(failures).toEqual([]);
    }, 20_000);
  }
});
