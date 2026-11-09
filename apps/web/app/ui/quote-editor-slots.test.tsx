import * as React from "react";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { QuoteEditor } from "./quote-editor";
import { ReviewProposal, type ReviewCaptureResult } from "./review-proposal";
import { JobFinalAccount } from "./job-final-account";

const hooks = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async original => ({
 ...await original<typeof React>(),
 useState: (initial: unknown) => [hooks.values.length ? hooks.values.shift() : typeof initial === "function" ? initial() : initial, vi.fn()],
 useRef: (current: unknown) => ({ current }),
 useCallback: (fn: unknown) => fn,
 useEffect: () => undefined,
}));
afterEach(() => { hooks.values = []; vi.unstubAllGlobals(); });
const jobId = "11111111-1111-4111-8111-111111111112";
const result: ReviewCaptureResult = {
 version: 1, environment: "synthetic_demo", captureId: jobId, jobId, proposalId: jobId, reviewId: jobId,
 status: "quoting", source: { text: "Fictional room", version: 1, kind: "text", acquisition: null, audioByteLength: 0 },
 proposal: { title: "Fictional decorating job", lines: [], questions: [] }, review: null,
};
// Hashes of the full static markup captured from HEAD before adding optional slots.
// Unlike a partial heading assertion, this detects any change to the no-slot DOM.
it.each([
 ["QuoteEditor", () => <QuoteEditor jobId={jobId} source={[]} questions={[]} back={() => undefined}/>, "a4c9b9d6cbee69e9673aba370689c54fd09b961232918c32cbc2c0607a43c8b7"],
 ["ReviewProposal", () => <ReviewProposal result={result} initialPricing back={() => undefined}/>, "a4c9b9d6cbee69e9673aba370689c54fd09b961232918c32cbc2c0607a43c8b7"],
 ["JobFinalAccount", () => { hooks.values = [{ account: null }, false]; return <JobFinalAccount jobId={jobId}/>; }, "d0f38032430f7b1c9f787c269cefbea0e5421ed3cca4bf9e9873d038b71c6c99"],
] as const)("keeps %s markup identical when no slot is passed", (_name, component, expected) => {
 vi.stubGlobal("React", React);
 const html = renderToStaticMarkup(component());
 const hash = createHash("sha256").update(html).digest("hex");
 expect(hash).toBe(expected);
});
