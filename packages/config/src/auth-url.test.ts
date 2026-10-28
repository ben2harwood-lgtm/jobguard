import { expect, it } from "vitest";
import { authUrlV1 } from "./auth-url.js";

const whitespace = [" ", "\t", "\r", "\n", "\u00a0", "\ufeff", "\v", "\f", "\u2003"];
const urls = ["https://app.invalid", "https://app.invalid/a%20b", "https://app.invalid/a b", "https://app.invalid/a\u2003b", "postgres://jobguard_identity:fake@db.invalid/identity", "mailto:person@builder.invalid", "custom:value", "", "not a url"];
const inputs = [...urls, ...whitespace.flatMap(w => [w + urls[0], urls[0] + w, `https://${w}app.invalid`, `${urls[0]}/a${w}b`])];
// The same corpus is run against main's Zod 3 schema in the scratch checkout.
it.each(inputs)("matches the WHATWG parser without rewriting %j", value => {
  const result = authUrlV1.safeParse(value);
  expect(result.success).toBe(URL.canParse(value));
  if (result.success) expect(result.data).toBe(value);
});
