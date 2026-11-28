// Preserve apostrophe/TAB/CR escaping so exported text can be restored.
const firstCharacterNeedsPrefix = /^[=+\-@'\t\r]/u;
const formulaAfterWhitespace = /^[ \t\r]+[=+\-@]/u;
const needsTextPrefix = (text: string, spaceAware: boolean) =>
  firstCharacterNeedsPrefix.test(text) || (spaceAware && formulaAfterWhitespace.test(text));

function encodeCsvCell(value: string | number, spaceAware: boolean): string {
  const text = String(value);
  // Space-aware exports leave typed numbers numeric; SQL billing casts every cell to text.
  const protect = (!spaceAware || typeof value === "string") && needsTextPrefix(text, spaceAware);
  return `"${(protect ? `'${text}` : text).replace(/"/gu, '""')}"`;
}

export function csvCell(value: string | number): string {
  return encodeCsvCell(value, true);
}

// Exact app.cb_csv_cell rule from 0727: only position 0; leading spaces stay unprotected.
// Extending this requires a separately approved migration and matching DB artifact bytes.
export function billingCsvCell(value: string | number): string {
  return encodeCsvCell(value, false);
}

export function restoreCsvCell(value: string): string {
  return value.startsWith("'") && needsTextPrefix(value.slice(1), true) ? value.slice(1) : value;
}
