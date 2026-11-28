import { describe, expect, it } from "vitest";
import { reviewProblemText, reviewStateLine } from "./v2-review-request-label";

describe("V2-G8 review request wording", () => {
  it("says why the request is not going, when it is due, and that it went once", () => {
    const base = { dueAt: null, sentAt: null };
    expect(reviewStateLine({ ...base, state: "off" })).toBe("Off. No review request is sent for this job.");
    expect(reviewStateLine({ ...base, state: "unpaid_invoice" })).toBe("Not sent while the final invoice is unpaid.");
    expect(reviewStateLine({ ...base, state: "open_dispute" })).toBe("Not sent while a recovery case is open on this job.");
    expect(reviewStateLine({ ...base, state: "too_soon", dueAt: "2026-12-09T18:10:00Z" })).toBe("Due 9 Dec, a week after the release.");
    expect(reviewStateLine({ ...base, state: "sent", sentAt: "2026-12-10T09:00:00Z" })).toBe("Sent 10 Dec to the practice catcher. Never sent again.");
    expect(reviewProblemText("REVIEW_REQUEST_ALREADY_SENT")).toBe("Already sent. It is never sent twice.");
    expect(reviewProblemText(undefined)).toBe("Not saved. Try again.");
  });
});
