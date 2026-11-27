import { expect, it } from "vitest";
import { shown } from "./view";
it("confirms a free-text answer in the customer's own words", () => {
  expect(shown({ other: "Charcoal grout please" })).toBe("Charcoal grout please");
  expect(shown({ choice: "White grout", other: false })).toBe("White grout");
  expect(shown({ arrangement: "Side gate" })).toBe("Side gate");
});
