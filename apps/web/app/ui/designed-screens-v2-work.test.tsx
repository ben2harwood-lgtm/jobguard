import * as React from "react";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { JobWorkState } from "./job-work-state";
import { JobVariations } from "./job-variations";
import { ProofStage } from "./proof-stage";

// V2-SQ-I-2: site work, extras and proof get #918's designed classes. Plain markup is pinned to the base
// (SQ-I-1 @ 9ea02d1cd); designed markup carries the classes.
vi.mock("react", async original => ({ ...await original<typeof React>(), useEffect: () => undefined }));
afterEach(() => vi.unstubAllGlobals());
const jobId = "11111111-1111-4111-8111-111111111112";
const html = (node: React.ReactElement) => { vi.stubGlobal("React", React); return renderToStaticMarkup(node); };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const screens = [
 ["JobWorkState", (designed?: boolean) => <JobWorkState {...(designed === undefined ? {} : { designed })} jobId={jobId}/>, ["card card-body designed-site-work", "work-actions form", "btn"]],
 ["JobVariations", (designed?: boolean) => <JobVariations {...(designed === undefined ? {} : { designed })} jobId={jobId}/>, ["variation-workspace designed-variations card card-body"]],
 ["ProofStage", (designed?: boolean) => <ProofStage {...(designed === undefined ? {} : { designed })} jobId={jobId}/>, ["proof-stage designed-proof card card-body", "btn"]],
] as const;

it.each(screens)("%s: designed=false is today's markup and designed carries the designed classes", (name, screen, classes) => {
 const plain = html(screen(false));
 expect(html(screen(undefined))).toBe(plain);
 expect(hash(plain)).toBe(BASE[name]);
 const designed = html(screen(true));
 for (const value of classes) expect(designed).toContain(value);
 for (const value of ["designed-site-work", "designed-variations", "designed-proof", "card-body", "btn"]) expect(plain).not.toContain(value);
 // Only classes change: the same text and the same labels in the same order.
 const words = (markup: string) => markup.replace(/\sclass="[^"]*"/gu, "");
 expect(words(designed)).toBe(words(plain));
});
const BASE: Record<string, string> = { JobWorkState: "a68a4126a55a40b2320008eb91a008d8138690dd650f3af6fd48d3e0cee9d17f", JobVariations: "225d84a2c1d7c98c36a424664571affca97e5b7d876909efe0321c64aa0ff048", ProofStage: "9f5b9583081c5ac209bb33974bd92c319737d7cfd8c9e29779c63fd9e8174298" };
