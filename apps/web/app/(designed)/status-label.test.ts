import { expect, it } from "vitest";
import { statusLabel } from "./designed-ui";

it("TOMMY-DEMO: reads Quote sent only for a quoting job whose quote was delivered", () => {
  expect(statusLabel("quoting", { kind: "quote", reference: "Q-0001", delivery: "delivered" })).toBe("Quote sent");
  expect(statusLabel("quoting", { kind: "quote", reference: "Q-0001", delivery: "queued" })).toBe("Quote being prepared");
  expect(statusLabel("quoting", { kind: "unknown", reference: null, delivery: "unknown" })).toBe("Quote being prepared");
  expect(statusLabel("quoting")).toBe("Quote being prepared");
  expect(statusLabel("accepted", { kind: "quote", reference: "Q-0001", delivery: "delivered" })).toBe("Customer said yes");
});
