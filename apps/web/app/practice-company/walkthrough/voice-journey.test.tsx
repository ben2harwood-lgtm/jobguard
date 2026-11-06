import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { stages, VoiceJourney } from "./voice-journey";
vi.stubGlobal("React", React);
describe("WALK-3 honest journey boundaries", () => {
  it("keeps nine stages and names the prepared-job and acceptance limitations", () => {
    expect(stages).toHaveLength(9);
    for (const index of [2, 3, 6]) expect(stages[index]![1]).toContain("This part uses a prepared example job");
    expect(stages[2]![1]).toContain("prerequisite still to build");
    expect(stages[3]![1]).toContain("not an authenticated customer response");
    expect(stages[5]![1]).toContain("builder's practice attestation");
    expect(stages[6]![1]).toContain("No finding is promised");
    expect(stages[7]![1]).toContain("not bank-confirmed");
  });
  it("renders an empty starting screen without customer, payment or completion claims", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const html = renderToStaticMarkup(<VoiceJourney />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).toContain("Do not enter real customer names");
    expect(html).toContain("instead of recording audio");
    expect(html).not.toContain("value-invoiced-gross");
    expect(html).not.toContain("Tour complete");
    expect(html).not.toContain("prepared example · simulated customer");
    vi.unstubAllGlobals(); vi.stubGlobal("React", React);
  });
});
