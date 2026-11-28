import { describe, expect, it } from "vitest";
import { saidPrices } from "./capture.application.js";

describe("V2-SQ-D plan-check condition 1: room prices reach the screen as typed data", () => {
  it("a room price said aloud arrives as pence with its cited words, and is not a whole-job price", () => {
    const text = "mrs patels bathroom rip out the old suite fit a new toilet and basin tile the walls the bathroom all in 4500";
    const said = saidPrices("patel", text);
    expect(said.roomPrices).toHaveLength(1);
    expect(said.roomPrices[0]).toMatchObject({ room: "Bathroom", pence: 450000 });
    expect(text).toContain(said.roomPrices[0]!.words);
    expect(said.roomPrices[0]!.words).toMatch(/4500/u);
    expect(said.wholeJobPrice).toBeNull();
  });
  it("words with no room price give none, and unreadable words never throw", () => {
    expect(saidPrices("smith", "Smith house refurb. In the kitchen rip out the old units and fit new ones for 2400.")).toEqual({ roomPrices: [], wholeJobPrice: null });
    expect(saidPrices("empty", "")).toEqual({ roomPrices: [], wholeJobPrice: null });
  });
});
