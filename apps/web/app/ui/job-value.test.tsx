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
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

const jobId = "11111111-1111-4111-8111-111111111111";
const otherJobId = "22222222-2222-4222-8222-222222222222";
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function valuePage(replyJobId: string) {
  vi.stubGlobal("React", React);
  const outcome = { pence: 12500, basis: "net", sources: [] };
  // Both replies are schema-valid: only the job binding differs.
  const value = jobValueResponseV1.parse({
    version: "job-value.v1", environment: "synthetic_demo", jobId: replyJobId,
    approvedExtras: outcome, approvedReductions: outcome, invoicedGross: outcome,
    recordedGross: outcome, outstandingGross: outcome, pendingExtras: [], quoteCoverage: [], blockedActions: [],
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
