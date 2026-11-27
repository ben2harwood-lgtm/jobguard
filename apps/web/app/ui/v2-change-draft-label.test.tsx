import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { changeDescription, changeMaterialsLine, changePriceLine, changeProblemText, changeStateLabel, changeTimeLine,
  penceFromPounds, pounds } from "./v2-change-draft-label";

describe("V2-F3 change draft wording", () => {
  it("states the drafted price, time and materials together", () => {
    const html = renderToStaticMarkup(<div>
      <p>{changePriceLine({ direction: "addition", delta: "1.5", unit: "m2", unitRatePence: 9500, previewPence: 14250 })}</p>
      <p>{changeTimeLine("Fit and grout the splashback", 60)}</p>
      <p>{changeMaterialsLine([{ materialNeeds: ["Surface protection", "Primer"] }, { materialNeeds: ["Tiles", "Adhesive", "Grout", "Primer"] }])}</p>
    </div>);
    expect(html).toBe("<div><p>Extra 1.5 m2 at £95.00 per m2 = £142.50 (you confirm the rate)</p>"
      + "<p>Extra time: Fit and grout the splashback +60 min</p>"
      + "<p>Will need more: Surface protection, Primer, Tiles, Adhesive, Grout</p></div>");
    expect(changePriceLine({ direction: "omission", delta: "1", unit: "m2", unitRatePence: 9500, previewPence: -9500 }))
      .toBe("Less 1 m2 at £95.00 per m2 = −£95.00 (you confirm the rate)");
    expect(changeMaterialsLine([{ materialNeeds: [] }])).toBe("");
    expect(changeDescription("Fit and grout kitchen splashback tiles", "7.5", "m2")).toBe("Change Fit and grout kitchen splashback tiles to 7.5 m2");
  });
  it("reads pounds to pence exactly", () => {
    expect([penceFromPounds("95"), penceFromPounds("95.5"), penceFromPounds(" 95.05 "), penceFromPounds("0")]).toEqual([9500, 9550, 9505, 0]);
    expect([penceFromPounds("95.505"), penceFromPounds("-1"), penceFromPounds("£95"), penceFromPounds("")]).toEqual([null, null, null, null]);
    expect(pounds(14250)).toBe("£142.50");
  });
  it("names each pending state", () => {
    const row = { state: "priced", current: true, linked: false, timeOnPlan: false, tasks: [{ proposedMinutes: 60 }] };
    expect(changeStateLabel(row)).toBe("Waiting to send for approval");
    expect(changeStateLabel({ ...row, linked: true })).toBe("Sent for approval. Not agreed yet");
    expect(changeStateLabel({ ...row, state: "approved" })).toBe("Agreed. Extra time not on the plan yet");
    expect(changeStateLabel({ ...row, state: "approved", timeOnPlan: true })).toBe("Agreed. Extra time is on the plan");
    expect(changeStateLabel({ ...row, state: "approved", tasks: [{ proposedMinutes: 0 }] })).toBe("Agreed. Extra time is on the plan");
    expect(changeStateLabel({ ...row, state: "rejected" })).toBe("Customer said no");
    expect(changeStateLabel({ ...row, current: false })).toBe("Replaced by a newer version");
    expect(changeProblemText("CHANGE_DRAFT_NO_CHANGE")).toBe("That is the quantity already agreed.");
    expect(changeProblemText("SOMETHING")).toBe("Not saved. Try again.");
  });
});
