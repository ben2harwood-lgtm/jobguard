import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { visibleTarget, Walkthrough, type WalkthroughStep } from "./walkthrough";
import { InstructionTour } from "../../demo-s/core-1000/instruction-tour";
vi.stubGlobal("React", React);
afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal("React", React); });
const step: WalkthroughStep = { id: "one", target: "#one", title: "Review", words: "Check the saved result.", isDone: vi.fn(() => false), autoAction: vi.fn() };
describe("WALK-1 walkthrough boundary", () => {
  it("renders accessible controls without executing actions or claiming completion", () => {
    const html = renderToStaticMarkup(<Walkthrough steps={[step]} onClose={() => {}} />);
    expect(html).toContain("Step 1 of 1");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Guided walkthrough"');
    expect(html).toContain('disabled="">Next');
    expect(html).toContain("Waiting for this step");
    expect(step.autoAction).not.toHaveBeenCalled(); expect(step.isDone).not.toHaveBeenCalled();
  });
  it("does not render an empty journey", () => {
    expect(renderToStaticMarkup(<Walkthrough steps={[]} onClose={() => {}} />)).toBe("");
  });
  it.each([null, { checkVisibility: (): boolean => false }, { checkVisibility: (): boolean => true, getClientRects: () => [] }])("rejects absent or hidden targets", element => {
    vi.stubGlobal("document", { querySelector: () => element });
    expect(visibleTarget("#one")).toBeNull();
  });
  it("accepts only a visible laid-out control", () => {
    const element = { checkVisibility: (): boolean => true, getClientRects: () => [{}] };
    vi.stubGlobal("document", { querySelector: () => element });
    expect(visibleTarget("#one")).toBe(element);
  });
  it("labels the initial consumer as an instruction tour with real disclosure controls", () => {
    const html = renderToStaticMarkup(<InstructionTour><li>Capture the fictional work.</li><li>Review your lines.</li></InstructionTour>);
    expect(html).toContain("does not");
    expect(html).toContain("instructions only");
    expect(html).toContain('<details id="core-guide-0"><summary>Capture the work</summary>');
    expect(html).not.toContain("Tour complete");
  });
});
