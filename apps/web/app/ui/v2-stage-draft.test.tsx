import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StageDraftCard, stageDraftLines } from "./v2-stage-draft";

const draft = { draftNo: 1, amount: "225.00", extras: ["Extend the splashback"], madeAt: "2026-11-27T10:00:00.000Z", withdrawnAt: null };
it("says a stage draft is not an invoice, shows the net amount and its extras, and no VAT figure", () => {
  expect(stageDraftLines("Deposit", draft)).toEqual(["Draft · not an invoice · not sent", "Deposit · draft 1", "£225.00 net",
    "Includes extras: Extend the splashback", "VAT and the invoice number are added when it is issued. Issuing comes next."]);
  expect(stageDraftLines("Deposit", { ...draft, extras: [] })[3]).toBe("Includes extras: none");
  const html = renderToStaticMarkup(<StageDraftCard stageLabel="Deposit" draft={draft} busy={false} onWithdraw={() => undefined}/>);
  expect(html).toContain("Withdraw draft");
  expect(html).not.toMatch(/VAT £|Send|Issue invoice|Invoice no/u);
});
it("shows a withdrawn draft as withdrawn, with no button", () => {
  const html = renderToStaticMarkup(<StageDraftCard stageLabel="Deposit" draft={{ ...draft, withdrawnAt: "2026-11-27T11:00:00.000Z" }}
    busy={false} onWithdraw={() => undefined}/>);
  expect(html).toContain("Deposit · draft 1 withdrawn");
  expect(html).not.toContain("<button");
});
