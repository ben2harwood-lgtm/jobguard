import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { v2JobProfit } from "@jobguard/core";
import { V2JobProfit } from "./v2-job-profit";
import { JOB_SAVED_EVENT } from "./job-page-fetch";

const hooks = vi.hoisted(() => ({ state: null as unknown, effect: undefined as undefined | (() => () => void) }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: () => [hooks.state, (next: unknown) => { hooks.state = next; }],
  useEffect: (effect: () => () => void) => { hooks.effect = effect; },
}));
const fetcher = vi.fn<typeof fetch>();
let cleanup: undefined | (() => void);
const jobId = "00000000-0000-4000-8000-000000000001";
const profit = v2JobProfit("1840000", "125000", "910000");
const render = () => renderToStaticMarkup(V2JobProfit({ jobId }));
async function mount() { render(); cleanup = hooks.effect!(); await vi.waitFor(() => expect(hooks.state).not.toBeNull()); }
beforeEach(() => {
  hooks.state = null; hooks.effect = undefined; fetcher.mockReset();
  vi.stubGlobal("React", React); vi.stubGlobal("fetch", fetcher); vi.stubGlobal("window", new EventTarget());
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });
it("renders the exact stored ex-VAT summary and refreshes after a save", async () => {
  fetcher.mockResolvedValueOnce(Response.json(profit));
  await mount();
  expect(render()).toContain(profit.summary); expect(render()).toContain(profit.notice);
  fetcher.mockResolvedValueOnce(Response.json(v2JobProfit("1840000", "125000", "920000")));
  window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT, { detail: { jobId } }));
  expect(render()).toBe("");
  await vi.waitFor(() => expect(render()).toContain("£9,200.00"));
  expect(fetcher).toHaveBeenLastCalledWith(`/api/jobs/${jobId}/profit-so-far`, { cache: "no-store" });
});
it.each([401, 403, 404])("shows no money or section on refusal %s", async status => {
  fetcher.mockResolvedValue(Response.json({ code: "NOT_FOUND" }, { status })); await mount();
  expect(render()).toBe("");
});
it("clears previous money on a failed refresh and shows an honest error", async () => {
  fetcher.mockResolvedValueOnce(Response.json(profit)); await mount();
  fetcher.mockRejectedValueOnce(new Error("offline"));
  window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT, { detail: { jobId } }));
  await vi.waitFor(() => expect(render()).toContain("Job profit could not load"));
  expect(render()).not.toContain("18,400");
});
it("ignores a slower response superseded by a newer saved snapshot", async () => {
  let finish: (response: Response) => void = () => {};
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(); cleanup = hooks.effect!();
  fetcher.mockResolvedValueOnce(Response.json(v2JobProfit("1840000", "125000", "920000")));
  window.dispatchEvent(new CustomEvent(JOB_SAVED_EVENT, { detail: { jobId } }));
  await vi.waitFor(() => expect(render()).toContain("£9,200.00"));
  finish(Response.json(profit)); await new Promise(resolve => setTimeout(resolve, 0));
  expect(render()).toContain("£9,200.00"); expect(render()).not.toContain("£9,100.00");
});
