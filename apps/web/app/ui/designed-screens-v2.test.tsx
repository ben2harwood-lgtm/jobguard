import * as React from "react";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { QuoteEditor } from "./quote-editor";
import { ReviewProposal, type ReviewCaptureResult } from "./review-proposal";
import { JobParties } from "./job-parties";

// V2-SQ-I-1: the designed review, quote editor and customer-and-site card. Plain markup is pinned to the base
// (SQ-E @ 152a8027b); designed markup carries #918's classes.
vi.mock("react", async original => ({ ...await original<typeof React>(), useEffect: () => undefined }));
afterEach(() => vi.unstubAllGlobals());
const jobId = "11111111-1111-4111-8111-111111111112";
const result: ReviewCaptureResult = {
 version: 1, environment: "synthetic_demo", captureId: jobId, jobId, proposalId: jobId, reviewId: jobId,
 status: "quoting", source: { text: "Fictional room", version: 1, kind: "text", acquisition: null, audioByteLength: 0 },
 proposal: { title: "Fictional decorating job", lines: [], questions: [] }, review: null,
};
const html = (node: React.ReactElement) => { vi.stubGlobal("React", React); return renderToStaticMarkup(node); };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const screens = [
 ["ReviewProposal", (designed?: boolean) => <ReviewProposal {...(designed === undefined ? {} : { designed })} result={{ ...result, status: "draft" }} back={() => undefined}/>, ["review designed-review", "reconcile card card-body", "questions card card-body form", "btn primary confirm", "btn ghost back", "kicker"]],
 ["ReviewProposal confirmed", (designed?: boolean) => <ReviewProposal {...(designed === undefined ? {} : { designed })} result={result} back={() => undefined}/>, ["review confirmed-scope designed-review card card-body", "btn ghost back", "tag blue", "btn primary"]],
 ["QuoteEditor", (designed?: boolean) => <QuoteEditor {...(designed === undefined ? {} : { designed })} jobId={jobId} source={[]} questions={[]} back={() => undefined}/>, ["quote-editor designed-quote", "totals card card-body", "coverage card card-body", "btn primary", "btn ghost back"]],
 ["JobParties", (designed?: boolean) => <JobParties {...(designed === undefined ? {} : { designed })} jobId={jobId}/>, ["designed-parties card card-body"]],
] as const;

it.each(screens)("%s: designed=false is today's markup and designed carries the designed classes", (_name, screen, classes) => {
 const plain = html(screen(false));
 expect(html(screen(undefined))).toBe(plain);
 expect(hash(plain)).toBe(BASE[_name]);
 const designed = html(screen(true));
 for (const name of classes) expect(designed).toContain(name);
 for (const name of ["designed-review", "designed-quote", "designed-parties", "card-body", "btn"]) expect(plain).not.toContain(name);
});
const BASE: Record<string, string> = { ReviewProposal: "d8c98aa17ea912cab5d590d9c7333e74de7bf75ebd852f6b841bf1a16f10df9e", "ReviewProposal confirmed": "a20774bce45e01fe15fa948522c1399e7855f908fd67c6efbc2d4aeb7938794f", QuoteEditor: "9a26b3340df7c8f3d667a064a2fd2ea12d478d598da1c7363b9d0443304b1ad5", JobParties: "c473f733a5b678283ae7165deb04782b5133578b6b1815c3b5bfcfff11980b04" };
