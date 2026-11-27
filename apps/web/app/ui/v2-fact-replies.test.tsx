import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { V2FactReplies, pastedAnswer } from "./v2-fact-replies";
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
