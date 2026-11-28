import { describe, expect, it } from "vitest";
import { aftercareMessage, aftercareProblemText, aftercareSend, aftercareSentLine, aftercareStateLine } from "./v2-aftercare-label";

describe("V2-G9 aftercare wording", () => {
  it("says which offer is due, when the next one is, and what went", () => {
    const base = { months: null, nextAt: null };
    expect(aftercareStateLine({ ...base, state: "off" })).toBe("Off. No aftercare offer is sent for this job.");
    expect(aftercareStateLine({ ...base, state: "too_soon", nextAt: "2027-06-02T18:10:00Z" })).toBe("Next offer due 2 Jun 2027.");
    expect(aftercareStateLine({ ...base, state: "due", months: 12 })).toBe("The 12-month offer is due now. Each offer is sent once.");
    expect(aftercareStateLine({ ...base, state: "open_dispute" })).toBe("Not sent while a recovery case is open on this job.");
    expect(aftercareStateLine({ ...base, state: "unpaid_invoice" })).toBe("Not sent while an invoice on this job is unpaid.");
    expect(aftercareStateLine({ ...base, state: "done" })).toBe("Both offers are done. Nothing more is sent.");
    expect(aftercareSentLine({ months: 6, sentAt: "2027-06-03T09:00:00Z" })).toBe("6-month offer sent 3 Jun 2027 to the practice catcher");
    expect(aftercareSend(6)).toBe("Send the 6-month check-up offer (practice)");
    expect(aftercareMessage(6)).toContain("6 months since we finished your work");
    expect(aftercareProblemText(undefined)).toBe("Not saved. Try again.");
  });
});
