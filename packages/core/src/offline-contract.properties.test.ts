import { expect, it } from "vitest";
import { offlinePolicyV1, parseOfflineIntentV1, toLogSiteExtraV1 } from "./offline-contract.js";

it("M31-S14 generated transport histories", () => {
 for (let seed = 1; seed <= 64; seed++) {
  let state = seed;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  const intents = Array.from({ length: 9 }, (_, i) => ({
   version: "offline-intent.v1", jobId: "10000000-0000-4000-8000-000000000001",
   clientMetadata: { capturedAt: i % 2 ? "2099-01-01T00:00:00Z" : "1970-01-01T00:00:00Z", hlc: { wallTimeMs: [0, Number.MAX_SAFE_INTEGER, 0][i % 3]!, logical: 0, nodeId: `crew-${i % 3}` } },
   body: { version: "log-site-extra.v1", commandId: `00000000-0000-7000-8000-${String(i + 1).padStart(12, "0")}`, note: `Fictional note ${seed}:${i}`, description: `Fictional crew ${i % 3}` },
  }));
  // Fisher-Yates supplies reorder/delay; adjacent groups describe concurrent delivery batches.
  const history = [...intents, ...intents.filter(() => next() % 2 === 0), intents[0]!];
  for (let i = history.length - 1; i > 0; i--) { const j = next() % (i + 1); [history[i], history[j]] = [history[j]!, history[i]!]; }
  const label = JSON.stringify({ seed, batches: Array.from({ length: Math.ceil(history.length / 3) }, (_, i) => history.slice(i * 3, i * 3 + 3).map(x => x.body.commandId)) });
  const originals = new Map(intents.map(raw => [raw.body.commandId, { jobId: raw.jobId, body: raw.body }]));
  for (const raw of history) {
   const parsed = parseOfflineIntentV1(JSON.parse(JSON.stringify(raw)));
   expect(toLogSiteExtraV1(parsed), label).toEqual(originals.get(raw.body.commandId));
   const equalClock = { ...raw, clientMetadata: { ...raw.clientMetadata, hlc: { wallTimeMs: 1, logical: 1, nodeId: "equal" } } };
   expect(toLogSiteExtraV1(equalClock), label).toEqual(toLogSiteExtraV1(raw));
   for (const logical of [-1, Number.MAX_SAFE_INTEGER + 1, "counter"]) expect(() => parseOfflineIntentV1({ ...raw, clientMetadata: { ...raw.clientMetadata, hlc: { ...raw.clientMetadata.hlc, logical } } }), label).toThrowError("OFFLINE_INVALID_INTENT");
   expect(() => parseOfflineIntentV1({ ...raw, version: `offline-intent.v${seed + 1}` }), label).toThrowError("OFFLINE_UNSUPPORTED_VERSION");
   expect(() => parseOfflineIntentV1({ ...raw, body: { ...raw.body, version: "approve-payment.v1" } }), label).toThrowError("OFFLINE_UNSUPPORTED_OPERATION");
   expect(toLogSiteExtraV1({ ...raw, body: { ...raw.body, note: "Fictional changed input" } }).body, label).not.toEqual(raw.body);
  }
  expect(offlinePolicyV1.operations, label).toEqual([{ version: "log-site-extra.v1", class: "append_only_facts" }]);
 }
});
