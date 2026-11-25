import { describe, expect, it } from "vitest";
import type { CrewBriefContent } from "@jobguard/db";
import { briefDisplayText } from "./brief-display-text";

describe("V2-D4B brief display", () => {
  const content: CrewBriefContent = { version: "v2-crew-brief.v1", trade: "tiler", quoteRevisionId: "id",
    accessWindow: "Mornings", tasks: [], photos: [], proofNeeded: [] };
  it("renders English when there is no translation", () => {
    expect(briefDisplayText(content, null)).toBe(content);
  });
  it("renders the saved translation and restores the unchanged English original", () => {
    const translated = { ...content, trade: "[pl] tiler", accessWindow: "[pl] Mornings" };
    expect(briefDisplayText(content, translated)).toBe(translated);
    expect(briefDisplayText(content, null).accessWindow).toBe("Mornings");
  });
});
