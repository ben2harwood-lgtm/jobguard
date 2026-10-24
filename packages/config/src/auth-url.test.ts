import { expect, it } from "vitest";
import { authUrlV1 } from "./auth-url.js";

it("rejects exactly the legacy whitespace pre-check set without normalizing valid URLs", () => {
  for (const value of ["https://app.invalid", "https://app.invalid/a%20b", "https://app.invalid/a b", "https://app.invalid/a\u2003b", "postgres://jobguard_identity:fake@db.invalid/identity"]) {
    expect(authUrlV1.parse(value)).toBe(value);
  }
  for (const whitespace of [" ", "\t", "\r", "\n", "\u00a0", "\ufeff", "\v", "\f", "\u2003"]) {
    expect(authUrlV1.safeParse(`${whitespace}https://app.invalid`).success).toBe(false);
    expect(authUrlV1.safeParse(`https://app.invalid${whitespace}`).success).toBe(false);
  }
  for (const whitespace of ["\t", "\r", "\n", "\u00a0", "\ufeff"]) expect(authUrlV1.safeParse(`https://app.invalid/a${whitespace}b`).success).toBe(false);
});
