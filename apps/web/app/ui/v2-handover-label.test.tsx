import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HandoverPack, handoverProblemText, handoverRefusalText, handoverTitle, handoverVersionLine } from "./v2-handover-label";
import { reconcileChoice } from "./v2-handover";

describe("V2-G2 handover wording", () => {
  it("renders the stored pack exactly, section by section", () => {
    const html = renderToStaticMarkup(<HandoverPack content={{ schema: "handover-content.v1", sections: [
      { key: "changes", title: "Changes", lines: ["Agreed change · splashback extended"] },
      { key: "certificates", title: "Manuals and certificates", lines: ["Still needed: electrical certificate. Your builder will supply it separately."] }] }}/>);
    expect(html).toBe('<section aria-label="Changes" class="card"><h3 class="card-title">Changes</h3><div class="card-body"><p>Agreed change · splashback extended</p></div></section>'
      + '<section aria-label="Manuals and certificates" class="card"><h3 class="card-title">Manuals and certificates</h3><div class="card-body"><p>Still needed: electrical certificate. Your builder will supply it separately.</p></div></section>');
  });
  it("labels the version, refusals and problems", () => {
    expect(handoverTitle(2)).toBe("Prepare handover · version 2");
    expect(handoverVersionLine({ version: 1, recordedAt: "2026-12-02T18:10:00Z" })).toBe("Version 1 · saved 2 Dec, 18:10 · kept unchanged");
    expect(handoverRefusalText({ section: "certificates", line: "Spare tiles worth £40", reason: "amount" }))
      .toBe("Has an amount: leave amounts out of the customer’s pack · Spare tiles worth £40");
    expect(handoverRefusalText({ section: "photos", line: "Photos", reason: "empty" })).toBe("Photos is ticked but has nothing in it. Tick an item or untick the section.");
    expect(handoverProblemText("HANDOVER_VERSION_CONFLICT")).toMatch(/newer version/u);
    expect(handoverProblemText(undefined)).toBe("Not saved. Try again.");
  });
  it("drops chosen ids the refreshed sources no longer offer, and keeps the rest of the draft", () => {
    const choice = { sections: ["done", "snags", "photos"] as const, lineIds: ["l1"], variationIds: ["v1"], photoIds: ["p1", "p2"], snagIds: ["s1"],
      certificates: [{ text: "Fictional boiler certificate", status: "included" as const }] };
    const sources = { lines: [{ id: "l1" }], variations: [{ variationId: "v1" }], photos: [{ id: "p2" }], snags: [] } as never;
    expect(reconcileChoice({ ...choice, sections: [...choice.sections] }, sources)).toEqual({ ...choice, sections: [...choice.sections], photoIds: ["p2"], snagIds: [] });
  });
});
