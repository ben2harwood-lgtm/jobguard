import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SiteExtra } from "./site-extra";

// Hook harness follows job-sources.test.tsx; effects and fetches run without a browser.
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
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../../northside/northside-practice", () => ({ NorthsidePractice: () => null }));
vi.mock("./site-visit", () => ({ SiteVisit: () => null }));
vi.mock("../../ui/local-dictation", () => ({ LocalDictation: () => null }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

const jobId = "11111111-1111-4111-8111-111111111111", extraId = "22222222-2222-4222-8222-222222222222";
async function screen(role: string, historyAvailable = true) {
  vi.stubGlobal("React", React);
  const fetcher = vi.fn(async (url: string) => {
    let body: unknown;
    if (url === "/api/contractor/site/jobs") body = { jobs: [{ jobId, reference: "Fictional order", openVisitId: null }] };
    else if (url === "/api/northside/extras") body = { role, extras: [{ jobId, extraId, orderReference: "Fictional order", description: "Fictional extra", state: "awaiting_approval", quotedPence: null, outcome: null, hasPhoto: false, residentConfirmed: false }] };
    else if (url.endsWith("/supervisor-queries")) body = { version: "site-supervisor-queries.v1", jobId, queries: [] };
    else if (url.endsWith("/proceed")) {
      if (role === "surveyor" || !historyAvailable) return { ok: false, status: 404, json: async () => ({ code: "NOT_FOUND" }) };
      body = { version: "extra-proceed-view.v1", jobId, extraId, requestId: extraId, history: [{ statementId: extraId, commandId: extraId, requestId: extraId, revisionHash: "a".repeat(64), actorMembershipId: jobId, recordedAt: "2026-11-05T12:00:00Z", reason: "Fictional urgent work" }] };
    } else throw new Error(`Unexpected fetch: ${url}`);
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal("fetch", fetcher);
  let html = "";
  for (let i = 0; i < 4; i++) {
    hooks.render(); html = renderToStaticMarkup(SiteExtra()); hooks.effects();
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return { html, proceedCalls: fetcher.mock.calls.filter(([url]) => url.endsWith("/proceed")) };
}

it("a surveyor's My extras list never requests or alerts about forbidden proceed history", async () => {
  const { html, proceedCalls } = await screen("surveyor");
  expect(html).toContain('aria-label="My extras"');
  expect(html).toContain("Fictional extra");
  expect(html).not.toContain("Proceed history unavailable.");
  expect(html).not.toContain('aria-label="Extra proceed history"');
  expect(proceedCalls).toHaveLength(0);
});
it.each(["operative", "supervisor"])("a %s still sees proceed history", async role => {
  const { html, proceedCalls } = await screen(role);
  expect(proceedCalls).toHaveLength(1);
  expect(html).toContain('aria-label="Extra proceed history"');
  expect(html).toContain("Fictional urgent work");
  expect(html).not.toContain("Proceed history unavailable.");
  expect(html.includes("Record proceed statement")).toBe(role === "operative");
});
it("an operative still sees an alert when permitted proceed history cannot load", async () => {
  const { html, proceedCalls } = await screen("operative", false);
  expect(proceedCalls).toHaveLength(1);
  expect(html).toContain('role="alert"');
  expect(html).toContain("Proceed history unavailable.");
});
