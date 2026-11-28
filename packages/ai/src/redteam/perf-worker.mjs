// Isolate regex attacks: a synchronous runaway must remain terminable by the
// parent, since a Vitest timeout alone cannot interrupt a blocked JS thread.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
    const source = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
    if (!existsSync(new URL(specifier, context.parentURL)) && existsSync(source)) return nextResolve(source.href, context);
  }
  return nextResolve(specifier, context);
} });
const { parseCaptureFixture } = await import("../capture-fixture-parser.ts");
const { readSpokenJob } = await import("../context-reader.ts");
const id = "00000000-0000-4000-8000-000000000001";
// Warm module/JIT setup outside the measured input. No network or model calls.
parseCaptureFixture(id, "Fit the latch for £25.");
readSpokenJob(id, "Fit the latch for £25.");
for (const [path, read] of [["capture", parseCaptureFixture], ["reader", readSpokenJob]]) {
  parentPort.postMessage({ event: "started", path });
  const started = performance.now();
  const output = read(id, workerData.text);
  parentPort.postMessage({ event: "timing", path, ms: performance.now() - started, lines: output.lines.length });
}
if (workerData.profile) {
  const original = RegExp.prototype.exec;
  const samples = new Map();
  RegExp.prototype.exec = function (text) {
    const start = performance.now();
    const result = original.call(this, text);
    const ms = performance.now() - start;
    const key = `/${this.source}/${this.flags}`;
    const sample = samples.get(key) ?? { regex: key, totalMs: 0, maxMs: 0, calls: 0 };
    sample.totalMs += ms; sample.maxMs = Math.max(sample.maxMs, ms); sample.calls++;
    samples.set(key, sample);
    return result;
  };
  try { parseCaptureFixture(id, workerData.text); readSpokenJob(id, workerData.text); }
  finally { RegExp.prototype.exec = original; }
  parentPort.postMessage({ event: "profile", samples: [...samples.values()].sort((a, b) => b.totalMs - a.totalMs).filter((sample, index) => index < 8 || sample.maxMs >= 50) });
}
