import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { jobValueResponseV1 } from "@jobguard/api/value-contracts";
import { ValuePage } from "./job-value";

// Reuse the job-sources/job-parties hook harness to run the real read and render.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn: unknown, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) slots[index] = { value: fn, deps };
      return slots[index]!.value;
    },
    useEffect(fn: () => (() => void) | void, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) {
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index]!.cleanup = fn() || undefined; });
      }
    },
  };
});
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), useContext: () => 0, ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

const jobId = "11111111-1111-4111-8111-111111111111";
const otherJobId = "22222222-2222-4222-8222-222222222222";
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function valuePage(replyJobId: string, foundAfterLock: unknown[] = []) {
  vi.stubGlobal("React", React);
  const outcome = { pence: 12500, basis: "net", sources: [] };
  // Both replies are schema-valid: only the job binding differs.
  const value = jobValueResponseV1.parse({
    version: "job-value.v1", environment: "synthetic_demo", jobId: replyJobId,
    approvedExtras: outcome, approvedReductions: outcome, invoicedGross: outcome,
    recordedGross: outcome, outstandingGross: outcome, pendingExtras: [], foundAfterLock, quoteCoverage: [], blockedActions: [],
  });
  const fetch = vi.fn(async () => response(value));
  vi.stubGlobal("fetch", fetch);
  const render = () => { hooks.render(); const tree = ValuePage({ jobId }); hooks.effects(); return renderToStaticMarkup(tree); };
  expect(render()).toContain("Loading your persisted money position");
  await new Promise<void>(resolve => setImmediate(resolve));
  return { html: render(), fetch };
}

it("shows a schema-valid money projection for the requested job", async () => {
  const { html } = await valuePage(jobId);
  expect(html).toContain("value-approved-extras");
  expect(html).toContain("£125.00");
  expect(html).not.toContain("Your job value could not load");
});

it("refuses a schema-valid reply for a different job and shows no money figure", async () => {
  const { html, fetch } = await valuePage(otherJobId);
  expect(html).toContain("Your job value could not load");
  expect(html).toContain("Try again");
  expect(html).not.toContain("value-card");
  expect(html).not.toContain("£");
  expect(html).not.toContain("125.00");
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/jobs/${jobId}/value`, { method: "GET", cache: "no-store" });
});

const found = (pence: number | null, id = otherJobId) => ({ id, description: "fitted loft hatch", sourceSignalId: jobId, revisionId: pence === null ? null : jobId, revision: pence === null ? null : 1, pence, approved: false, href: `/jobs/${jobId}#variation-${id}` });
it("leads with the sum of priced catches and inspectable extra and Final Check links", async () => {
 const { html } = await valuePage(jobId, [found(30000), found(5000, jobId), found(null, "33333333-3333-4333-8333-333333333333")]);
 expect(html).toContain("Found after your bill was complete: £350.00 — from JobGuard&#x27;s final check");
 expect(html.indexOf("value-found-after-lock")).toBeLessThan(html.indexOf("This page does not guess"));
 expect(html).toContain(`/jobs/${jobId}#variation-${otherJobId}`);
 expect(html).toContain(`/jobs/${jobId}#final-check`);
 expect(html).toContain("awaiting approval");
 expect(html).toContain("found, not priced yet");
});
it("shows an unpriced catch without assigning it pounds", async () => {
 const { html } = await valuePage(jobId, [found(null)]);
 expect(html).toContain("found, not priced yet");
 expect(html).not.toContain("Found after your bill was complete:");
 expect(html).not.toContain("£300");
});
it("adds no found line for an empty projection", async () => {
 expect((await valuePage(jobId)).html).not.toContain("value-found-after-lock");
});
it("defaults older value responses to an empty catch projection", () => {
 const outcome = { pence: null, basis: "net", sources: [] };
 expect(jobValueResponseV1.parse({ version: "job-value.v1", environment: "synthetic_demo", jobId, approvedExtras: outcome, approvedReductions: outcome, invoicedGross: outcome, recordedGross: outcome, outstandingGross: outcome, pendingExtras: [], quoteCoverage: [], blockedActions: [] }).foundAfterLock).toEqual([]);
});
