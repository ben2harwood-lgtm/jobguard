import { describe, expect, it } from "vitest";
import { captureErrorMessage } from "./capture-error-message";

describe("V2-SQ-I-1 capture error message", () => {
  it("says to add the work details when an empty description is refused", () => {
    expect(captureErrorMessage("INVALID_CAPTURE", true)).toBe("We could not make the draft: add the work details first. Your original text is still here; change it or try again.");
  });
  it("keeps today's text for every other refusal", () => {
    expect(captureErrorMessage("INVALID_CAPTURE", false)).toBe("We could not make the draft (INVALID_CAPTURE). Your original text is still here; change it or try again.");
    expect(captureErrorMessage("TENANT_FORBIDDEN", true)).toBe("We could not make the draft (TENANT_FORBIDDEN). Your original text is still here; change it or try again.");
    expect(captureErrorMessage(undefined, false)).toBe("We could not make the draft (undefined). Your original text is still here; change it or try again.");
    expect(captureErrorMessage("CAPTURE_ID_REUSED", true)).toContain("conflict with an earlier draft (CAPTURE_ID_REUSED)");
  });
});
