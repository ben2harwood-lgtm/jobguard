import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Core1000Guide, Core1000Journey, core1000Link, core1000Source } from "./journey";
import { readCore1000Report } from "./journey-model";
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
  it("marks a step done only from its saved read; refused reads stay not done", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const report = await readCore1000Report(id, (async (path: string) => String(path).endsWith("/final-account")
      ? new Response(JSON.stringify({ account: { id, issueBlocked: false, totals: { total: { pence: 132000 } } } }))
      : new Response("{}", { status: 403 })) as typeof fetch);
    expect(report.complete).toBe(false);
    expect(report.rows.filter(row => row.done).map(row => row.id)).toEqual(["final-account"]);
    expect(report.rows.find(row => row.id === "final-account")).toMatchObject({ state: "£1,320.00 gross", record: id });
    expect(report.rows.find(row => row.id === "invoice")).toMatchObject({ done: false, state: "No invoice issued", record: null });
  });
});
