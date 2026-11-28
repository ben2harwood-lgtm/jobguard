import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { V2ChoiceAllowances, mergeForms, type Form } from "./v2-choice-allowances";
import type { ChoiceAllowanceView } from "@jobguard/api/workspace";
it("shows a loading state and the practice boundary without approve or send actions", () => {
  const html = renderToStaticMarkup(<V2ChoiceAllowances jobId="11111111-1111-4111-8111-111111111111"/>);
  expect(html).toContain("Customer choices and allowances");
  expect(html).toContain("nothing is sent or charged");
  expect(html).toContain("nothing is added to the price until you approve it");
  expect(html).toContain("Amounts exclude VAT");
  expect(html).toContain("Loading customer choices");
  expect(html).not.toMatch(/Approve|Send/u);
});

const view = (factId: string, amount: string): ChoiceAllowanceView => ({ factId, question: `Fictional ${factId}`, neededBy: "2099-01-05",
  factStatus: "open", late: null, chosen: null, draft: null, withdrawn: [], warning: null, unfinished: null,
  allowance: { version: 1, basis: "total", amount, quantity: "1", unit: "item", decideBy: "2099-01-05" } });
it("saving one choice keeps unsaved edits in the other choices' forms", () => {
  const edited: Record<string, Form> = {
    a: { basis: "total", amount: "99.00", quantity: "", unit: "", decideBy: "2099-01-05", item: "", chosen: "" },
    b: { basis: "total", amount: "77.00", quantity: "", unit: "", decideBy: "2099-01-05", item: "typed", chosen: "" },
  };
  const next = [view("a", "50.00"), view("b", "10.00"), view("c", "5.00")];
  const forms = mergeForms(edited, next, "a");
  expect(forms.a!.amount).toBe("50.00");
  expect(forms.b).toEqual(edited.b);
  expect(forms.c!.amount).toBe("5.00");
  expect(mergeForms(edited, next).b!.amount).toBe("10.00");
});
