import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { crewBlockedNote, crewKindLabel, crewLinkState, crewPageHead, crewPressLabel, crewPressState, crewReportedNote, crewSentNote } from "./v2-crew-link-label";

describe("V2-F7M crew link wording", () => {
  it("labels kinds, presses and confirmation", () => {
    expect(crewKindLabel("blocked")).toBe("Blocked");
    expect(crewPressLabel("done", "Fictional Tess Tile")).toBe("Done by Fictional Tess Tile, by link");
    expect(crewPressState(false)).toBe("Not confirmed yet");
    expect(crewReportedNote("changed")).toBe("You sent: Changed");
    expect(crewPressState(true)).toBe("Confirmed");
    expect(crewSentNote("changed")).toBe("Changed sent to the builder. The builder confirms it on their screen.");
  });
  it("joins a blocked reason and an optional note as the mock does", () => {
    expect(crewBlockedNote("Materials not here", "  ")).toBe("Materials not here");
    expect(crewBlockedNote("No access to the room", "Key with neighbour")).toBe("No access to the room · Key with neighbour");
  });
  it("shows a link's state, cancelled and replaced first", () => {
    const now = Date.parse("2026-11-26T12:00:00Z");
    expect(crewLinkState({ cancelled: true, replaced: true, expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("Cancelled");
    expect(crewLinkState({ cancelled: false, replaced: true, expiresAt: "2026-12-01T00:00:00Z" }, now)).toBe("Replaced");
    expect(crewLinkState({ cancelled: false, replaced: false, expiresAt: "2026-11-26T11:00:00Z" }, now)).toBe("Expired");
    expect(crewLinkState({ cancelled: false, replaced: false, expiresAt: "2026-12-10T12:00:00Z" }, now)).toBe("Expires 10 Dec");
  });
  it("renders the page head with no price wording beyond 'No prices'", () => {
    const head = crewPageHead("tiler", "Fictional Tess Tile");
    const html = renderToStaticMarkup(<header><p>{head.kicker}</p><h1>{head.title}</h1><p>{head.text}</p></header>);
    expect(html).toContain("Your tiler brief"); expect(html).toContain("For Fictional Tess Tile only.");
    expect(html).not.toMatch(/£|value|success fee/iu);
  });
});
