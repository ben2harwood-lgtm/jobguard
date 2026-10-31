import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Core1000Guide, Core1000Journey, core1000Link, core1000Source } from "./journey";
vi.mock("../../ui/jobguard-app", () => ({ WalkIt: () => null }));
vi.mock("../../ui/workspace-shell", () => ({ WorkspaceShell: () => null }));
vi.stubGlobal("React", React);

describe("DEMO-J1 core-1000 guided entry", () => {
  it("supplies five priced capture lines and labels instructions as expected figures", () => {
    expect(core1000Source.match(/^ITEM:/gm)).toHaveLength(5);
    expect(core1000Source).not.toContain("Replace shelves");
    const html = renderToStaticMarkup(<Core1000Guide />);
    for (const text of ["£1,320", "£820", "£700", "£120", "no v1 cap or activation obligation", "MON-5 customer journey: not ready yet", "Independent RED verdict: missing", "0 of 2"]) expect(html).toContain(text);
    expect(html).toContain("does not mark steps complete");
    expect(html).not.toContain("You finished");
  });
  it("does not create a session, capture or show saved facts during initial render", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(<Core1000Journey />);
    expect(fetch).not.toHaveBeenCalled();
    expect(html).toContain("Checking practice session");
    expect(html).not.toContain("data-job-id");
    vi.unstubAllGlobals(); vi.stubGlobal("React", React);
  });
  it.each(["foreign", ["11111111-1111-4111-8111-111111111111"], "<script>"])("refuses malformed or duplicate job selectors: %s", requestedJobId => {
    const html = renderToStaticMarkup(<Core1000Journey requestedJobId={requestedJobId} />);
    expect(html).toContain("Invalid saved job reference");
    expect(html).not.toContain("Loading your job");
    expect(html).not.toContain("Start core-1000 practice session");
  });
  it("resume links carry only a locator; no completion, prices, lock or allocation authority", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(core1000Link(id)).toBe(`/demo-s/core-1000?jobId=${id}`);
    expect(() => core1000Link(`${id}&completed=true`)).toThrow();
  });
});
