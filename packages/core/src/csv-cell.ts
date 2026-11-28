// Match spreadsheet formula starters even after whitespace. Preserve the existing
// apostrophe/TAB/CR escaping so exported text can be restored without ambiguity.
const needsTextPrefix = /^(?:[=+\-@'\t\r]|[ \t\r]+[=+\-@])/u;

export function csvCell(value: string | number): string {
  const text = String(value);
  // Only typed numeric columns bypass text protection (including negative values).
  const safe = typeof value === "string" && needsTextPrefix.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/gu, '""')}"`;
}

export function restoreCsvCell(value: string): string {
  return value.startsWith("'") && needsTextPrefix.test(value.slice(1)) ? value.slice(1) : value;
}
