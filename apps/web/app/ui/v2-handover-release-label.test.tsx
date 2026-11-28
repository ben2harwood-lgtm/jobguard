import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerPack, acknowledgedLine, earlierContact, linkStoppable, receiptOnly, releaseLine, releaseProblemText, stopProblemText } from "./v2-handover-release-label";

const content = { schema: "handover-content.v1" as const, sections: [{ key: "snags" as const, title: "Outstanding snags", lines: ["Refit the hall door stop."] }] };
describe("V2-G3 handover release wording", () => {
  it("renders the customer's pack with the receipt-only text, and the newer-version note only when there is one", () => {
    const html = renderToStaticMarkup(<CustomerPack firmName="Fictional Builders" version={1} content={content} newer={false}/>);
    expect(html).toContain("From Fictional Builders · version 1");
    expect(html).toContain("Refit the hall door stop.");
    expect(html).toContain(receiptOnly);
    expect(html).not.toContain("Newer version available");
    expect(renderToStaticMarkup(<CustomerPack firmName="F" version={1} content={content} newer/>)).toContain("Newer version available");
    // V2-G7: M3 shows it as an alert at the top of the pack.
    expect(renderToStaticMarkup(<CustomerPack firmName="F" version={1} content={content} newer/>)).toMatch(/^<div class="form"><div role="alert"[^>]*><strong>Newer version available/u);
  });
  it("labels releases, receipts and refusals", () => {
    const row = { version: 1, recipient: "customer@jobguard-v2.invalid", releasedAt: "2026-12-02T18:10:00Z", acknowledgedAt: null, superseded: false,
      stoppedAt: null, recipientCurrent: true };
    expect(releaseLine(row)).toBe("Version 1 released to customer@jobguard-v2.invalid · 2 Dec, 18:10 · acknowledgement pending");
    expect(releaseLine({ ...row, acknowledgedAt: "2026-12-03T09:05:00Z", superseded: true }))
      .toBe("Version 1 released to customer@jobguard-v2.invalid · 2 Dec, 18:10 · acknowledged 3 Dec, 09:05 · a newer version was released");
    expect(acknowledgedLine("2026-12-03T09:05:00Z")).toBe("Receipt acknowledged 3 Dec, 09:05.");
    expect(releaseProblemText("HANDOVER_SITE_NOT_COMPLETE")).toBe("Not released: finish the site work first.");
    expect(releaseProblemText(undefined)).toBe("Not released. Try again.");
  });
  it("V2-G4 labels a stopped link and a link sent to an earlier customer contact, and offers stop only on a live link", () => {
    const row = { version: 1, recipient: "customer@jobguard-v2.invalid", releasedAt: "2026-12-02T18:10:00Z", acknowledgedAt: null, superseded: false,
      stoppedAt: null, recipientCurrent: true, expiresAt: "2027-01-01T00:00:00Z" };
    const now = Date.parse("2026-12-04T00:00:00Z");
    expect(releaseLine({ ...row, stoppedAt: "2026-12-03T10:00:00Z" }))
      .toBe("Version 1 released to customer@jobguard-v2.invalid · 2 Dec, 18:10 · acknowledgement pending · link stopped 3 Dec, 10:00");
    expect(releaseLine({ ...row, recipientCurrent: false })).toContain(earlierContact);
    expect(releaseLine({ ...row, recipientCurrent: false, stoppedAt: "2026-12-03T10:00:00Z" })).not.toContain(earlierContact);
    expect(linkStoppable(row, now)).toBe(true);
    expect([linkStoppable({ ...row, stoppedAt: "2026-12-03T10:00:00Z" }, now), linkStoppable({ ...row, recipientCurrent: false }, now),
      linkStoppable({ ...row, expiresAt: "2026-12-03T00:00:00Z" }, now)]).toEqual([false, false, false]);
    expect(stopProblemText("HANDOVER_LINK_ALREADY_STOPPED")).toBe("This link was already stopped.");
    expect(stopProblemText("HANDOVER_RELEASE_INVALID_COMMAND")).toBe("Not stopped: add a reason of up to 200 characters.");
    expect(stopProblemText(undefined)).toBe("Not stopped. Try again.");
  });
});
