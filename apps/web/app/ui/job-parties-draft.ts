import { siteV1, type SiteV1 } from "@jobguard/core";

/** `site.v1` allows one to four address lines. */
export const MAX_ADDRESS_LINES = 4;

/**
 * The draft edits the first address line in its own input and every further line in a second, multi-line input (one line per row).
 * Lines are trimmed and blank rows are dropped, so a saved address always comes back as the same list of lines.
 */
export function addressLinesFromDraft(first: string, more: string): string[] {
  return [first.trim(), ...more.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)];
}

/** The text of the further-lines input for a saved address: every line after the first, one per row. */
export const moreAddressLines = (lines: readonly string[]): string => lines.slice(1).join("\n");

const canonical = (site: SiteV1) => JSON.stringify([site.addressLines, site.town, site.postcode, site.unit ?? "", site.uprn ?? ""]);

/**
 * Is the drafted site exactly the saved site (same lines, town, postcode, unit and UPRN once the postcode is normalised)?
 * When it is, saving keeps the saved site's identity instead of creating another one. A draft that is not a valid site is never
 * the same, so the save goes to the server, which reports the error.
 */
export function sameSite(draft: unknown, saved: SiteV1): boolean {
  const parsed = siteV1.safeParse(draft);
  return parsed.success && canonical(parsed.data) === canonical(saved);
}
