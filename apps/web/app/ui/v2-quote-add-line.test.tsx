import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { quoteAddLineCommandV1 } from "@jobguard/db";
import { addedLine, addLineAddedText, addLineCommand, addLineProblemText, withAddedScope } from "./v2-quote-add-line";
import { V2QuoteAddLine } from "./v2-quote-add-line-panel";

const item = { scopeItemId: "10000000-0000-8000-8000-000000000001", scopeRevisionId: "10000000-0000-8000-8000-000000000002",
  description: "Skip or waste removal" };

describe("V2-C6 add a line to the quote", () => {
  it("builds the strict command, trimmed, with the prompt only when there is one", () => {
    const typed = addLineCommand("  Skip hire  ");
    expect(quoteAddLineCommandV1.parse(typed)).toEqual({ version: "v2-quote-add-line.v1", commandId: typed.commandId, description: "Skip hire" });
    expect(addLineCommand("Skip or waste removal", "waste").promptId).toBe("waste");
    expect(quoteAddLineCommandV1.safeParse({ ...typed, description: " " }).success).toBe(false);
    expect(quoteAddLineCommandV1.safeParse({ ...typed, description: "x".repeat(501) }).success).toBe(false);
    expect(quoteAddLineCommandV1.safeParse({ ...typed, promptId: "Waste Removal" }).success).toBe(false);
    expect(quoteAddLineCommandV1.safeParse({ ...typed, unitRatePence: 100 }).success).toBe(false);
  });

  it("makes an included, unpriced line added by the builder", () => {
    expect(addedLine(item)).toMatchObject({ scopeItemId: item.scopeItemId, scopeRevisionId: item.scopeRevisionId, origin: "human",
      included: true, quantity: "1", unit: "item", unitRatePence: null, rateProvenance: null });
  });

  it("shows confirmed scope missing from the saved revision once, after the saved lines", () => {
    const saved = [{ ...addedLine(item), scopeItemId: "10000000-0000-8000-8000-000000000003", origin: "captured" as const }];
    const merged = withAddedScope(saved, [item, { ...item, scopeItemId: saved[0]!.scopeItemId }]);
    expect(merged.map(line => [line.scopeItemId, line.origin])).toEqual([[saved[0]!.scopeItemId, "captured"], [item.scopeItemId, "human"]]);
    expect(withAddedScope(merged, [item])).toHaveLength(2);
  });

  it("says what happened in plain words", () => {
    expect(addLineAddedText("Skip hire")).toBe("Skip hire added without a price. Price it or exclude it with a reason, then save a draft revision.");
    expect(addLineProblemText("QUOTE_NOT_EDITABLE")).toBe("Not added: this quote has been sent or accepted. Add it as a change to the job instead.");
    expect(addLineProblemText("QUOTE_ADD_LINE_INVALID")).toBe("Not added: describe the line in 1 to 500 characters.");
    expect(addLineProblemText("QUOTE_COMMAND_CONFLICT")).toContain("already used");
    expect(addLineProblemText(undefined)).toBe("Not added. Nothing was changed. Try again.");
  });

  it("renders the box with a labelled input and a disabled button until something is typed", () => {
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(<V2QuoteAddLine jobId="job" onAdded={vi.fn()}/>);
    vi.unstubAllGlobals();
    expect(html).toContain("<h2 id=\"quote-add-line-title\">Add a line</h2>");
    expect(html).toContain("aria-label=\"Describe the line to add\"");
    expect(html).toMatch(/<button type="button" disabled="">Add this line<\/button>/u);
  });
});
