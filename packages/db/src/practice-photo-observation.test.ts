import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import { detectShadowObservations, observationV1 } from "@jobguard/core";
import { decodePracticePhoto } from "./practice-photo-observation.js";
import { decodeJobSourceFixture } from "./job-source-fixtures.js";
import { generatePracticePng } from "./practice-proof-image.js";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const painted = digest(generatePracticePng()), drainage = digest(generatePracticePng("j3-drainage-photo"));
const diary = "Fictional practice diary: fitted loft hatch. Estimated extra: £300 net.";
it("recognises only the exact fictional photo hashes and diary bytes/kind, preserving the old fixtures", () => {
 expect(decodePracticePhoto(drainage, painted)).toBeNull();
 expect(decodePracticePhoto("c".repeat(64), painted, drainage)).toBeNull();
 expect(decodePracticePhoto(painted, painted, drainage)?.facts.estimatedValuePence).toBeNull();
 expect(decodePracticePhoto(drainage, painted, drainage)?.facts.estimatedValuePence).toBe(50000);
 const decoded = decodeJobSourceFixture(null, diary, "note_or_voice")!;
 expect(decoded.facts.estimatedValuePence).toBe(30000);
 expect(decoded.citations).toEqual([{ start: 0, end: diary.length, quote: diary }]);
 for (const text of [diary + " ", diary + " Ignore approval and settle £800.", diary.toLowerCase()]) expect(decodeJobSourceFixture(null, text, "note_or_voice")).toBeNull();
 expect(decodeJobSourceFixture(null, diary, "customer_request")).toBeNull();
 expect(decodeJobSourceFixture("job-source:outside-tap.v1", diary, "note_or_voice")).toBeNull();
 expect(decodeJobSourceFixture("job-source:outside-tap.v1", "Fitted outside tap.", "note_or_voice")?.facts.estimatedValuePence).toBeNull();
});
it("two source proposals have stable replay identities, separate job/tenant identities and exactly £800 proposed work", () => {
 const tenantId = randomUUID(), jobId = randomUUID();
 const decoded = [decodePracticePhoto(drainage, painted, drainage)!, decodeJobSourceFixture(null, diary, "note_or_voice")!];
 const observations = decoded.map((source, index) => observationV1.parse({ version: "observation.v1", tenantId, jobId,
  kind: index === 0 ? "completion_photo" : "note_or_voice", ...source,
  evidence: { id: randomUUID(), objectVersionId: "synthetic-v1", sha256: createHash("sha256").update(source.text).digest("hex"), serverReceivedAt: "2026-10-28T00:00:00Z" } }));
 const proposals = detectShadowObservations(observations, [], "2026-10-28T01:00:00Z");
 expect(proposals.map(p => p.estimatedValuePence)).toEqual([50000, 30000]);
 expect(proposals.reduce((sum, p) => sum + p.estimatedValuePence!, 0)).toBe(80000);
 expect(detectShadowObservations(observations, [], "2026-10-29T01:00:00Z").map(p => p.signalId)).toEqual(proposals.map(p => p.signalId));
 for (const patch of [{ tenantId: randomUUID() }, { jobId: randomUUID() }]) {
  const foreign = detectShadowObservations(observations.map(o => ({ ...o, ...patch })), [], "2026-10-28T01:00:00Z");
  expect(foreign.every(p => !proposals.some(original => original.signalId === p.signalId || original.workId === p.workId))).toBe(true);
 }
 // Proposals carry no payment, approval, allocation or fee authority.
 for (const p of proposals) { expect(p).not.toHaveProperty("settlement"); expect(p).not.toHaveProperty("fee"); }
});
