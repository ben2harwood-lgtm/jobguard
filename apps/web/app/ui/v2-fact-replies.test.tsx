import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FactAsk, V2FactReplies, pastedAnswer } from "./v2-fact-replies";
it("shows the practice boundary and a loading state", () => {
  const html = renderToStaticMarkup(<V2FactReplies jobId="11111111-1111-4111-8111-111111111111"/>);
  expect(html).toContain("Replies received: apply?");
  expect(html).toContain("fictional contacts only");
  expect(html).toContain("nothing real is sent");
  expect(html).toContain("Loading replies");
});
it("records pasted availability only from an explicit yes or no", () => {
  expect(pastedAnswer("crew_availability", "yes")).toEqual({ available: true });
  expect(pastedAnswer("crew_availability", "no")).toEqual({ available: false });
  for (const text of ["I am available", "can do", "not sure", ""]) expect(pastedAnswer("crew_availability", text)).toBeNull();
  expect(pastedAnswer("access", "  Side gate  ")).toEqual({ arrangement: "Side gate" });
});
// V2-E7 mount: the request row shows its reminder and its "unconfirmed" flag.
it("shows a request's reminder time and unconfirmed reason on its row", () => {
  const fact = { id: "f", kind: "merchant_delivery_date", owner: { kind: "merchant", name: "Fictional Merchant" }, neededBy: "2026-12-03",
    detail: { kind: "merchant_delivery_date", item: "Hall tiles" }, status: "open", version: 1 } as never;
  const view = { facts: [fact], customer: { email: null }, recipients: [], replies: [], requests: [{ id: "r", factId: "f",
    contactEmail: "merchant@jobguard-v2.invalid", status: "open", current: true }] } as never;
  const html = renderToStaticMarkup(<FactAsk fact={fact} view={view} busy={false} link={null} send={async () => null} shown={() => undefined}
    reminders={[{ requestId: "r", kind: "reminder", reason: null, recordedAt: "2026-12-01T12:00:00.000Z" },
      { requestId: "r", kind: "unconfirmed", reason: "no_reply", recordedAt: "2026-12-02T08:00:00.000Z" },
      { requestId: "other", kind: "unconfirmed", reason: "link_expired", recordedAt: "2026-12-02T08:00:00.000Z" }]}/>);
  expect(html).toContain("Link to merchant@jobguard-v2.invalid: open");
  expect(html).toContain("Reminder sent Tue 1 Dec, 12:00");
  expect(html).toContain("Unconfirmed: no reply by the day before");
  expect(html).not.toContain("the reply link expired");
});
