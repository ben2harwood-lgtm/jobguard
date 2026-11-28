// V2-C6 wording and shapes for adding a line to a quote before it is sent. Pure: tested without a browser.
import type { QuoteLine } from "@jobguard/core";

export const addLineHeading = "Add a line";
export const addLineInputLabel = "Describe the line to add";
export const addLineButton = "Add this line";
export const addLineHelp = "It is added without a price. Price it, or exclude it with a reason, then save a draft revision.";

export type AddLineReceipt = { scopeItemId: string; scopeRevisionId: string; description: string };

export function addLineCommand(description: string, promptId?: string) {
  return { version: "v2-quote-add-line.v1" as const, commandId: crypto.randomUUID(), description: description.trim(),
    ...(promptId ? { promptId } : {}) };
}

/** The new quote line: added by the builder, included, and not priced yet. */
export function addedLine(receipt: AddLineReceipt): QuoteLine {
  return { id: crypto.randomUUID(), scopeItemId: receipt.scopeItemId, scopeRevisionId: receipt.scopeRevisionId,
    description: receipt.description, origin: "human", included: true, exclusionReason: null, quantity: "1", unit: "item",
    unitRatePence: null, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: null, category: null, region: null };
}

/** Lines for confirmed scope added since the saved revision, so a reload still shows them to price. */
export function withAddedScope(lines: readonly QuoteLine[], scope: readonly AddLineReceipt[]): QuoteLine[] {
  const missing = scope.filter(item => !lines.some(line => line.scopeItemId === item.scopeItemId));
  return [...lines, ...missing.map(addedLine)];
}

export function addLineAddedText(description: string) {
  return `${description} added without a price. Price it or exclude it with a reason, then save a draft revision.`;
}

export function addLineProblemText(code: string | undefined) {
  if (code === "QUOTE_NOT_EDITABLE") return "Not added: this quote has been sent or accepted. Add it as a change to the job instead.";
  if (code === "QUOTE_ADD_LINE_INVALID") return "Not added: describe the line in 1 to 500 characters.";
  if (code === "QUOTE_COMMAND_CONFLICT") return "Not added: that request was already used for a different line. Try again.";
  return "Not added. Nothing was changed. Try again.";
}
