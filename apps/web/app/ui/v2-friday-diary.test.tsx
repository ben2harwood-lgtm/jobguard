import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FridayDiaryList, diaryRefusalLabel, diaryTime } from "./v2-friday-diary";

const row = { id: "00000000-0000-4000-8000-000000000001", text: "Tiles delivered and stacked in the hall",
  receivedAt: "2026-11-25T10:05:00Z", shared: true, refused: null } as const;
describe("V2-DV1 diary card wording", () => {
  it("lists each note with its London time, text and the customer switch", () => {
    const html = renderToStaticMarkup(<FridayDiaryList entries={[row]} busy={false} onToggle={() => undefined}/>);
    expect(html).toContain("Marked notes are added when you prepare the update. You can still edit or remove them before sending.");
    expect(html).toContain("Wed 10:05</time> · Tiles delivered and stacked in the hall");
    expect(html).toContain('checked=""');
    expect(html).toContain("Customer can see this");
    expect(diaryTime("2026-06-24T09:05:00Z")).toBe("Wed 10:05");
  });
  it("says why a note cannot be offered", () => {
    const html = renderToStaticMarkup(<FridayDiaryList entries={[{ ...row, shared: false, text: "Extra socket quoted at 85.00", refused: "amount" }]}
      busy={false} onToggle={() => undefined}/>);
    expect(html).toContain("Has an amount: leave amounts out of the customer update");
    expect(html).not.toContain('checked=""');
    expect(diaryRefusalLabel("too_long")).toBe("Too long for one line");
    expect(diaryRefusalLabel(null)).toBeNull();
  });
  it("says when there are no notes", () => {
    expect(renderToStaticMarkup(<FridayDiaryList entries={[]} busy onToggle={() => undefined}/>)).toContain("No diary notes this week.");
  });
});
