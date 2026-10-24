import { z } from "zod";

/** Reject the legacy URL whitespace set before Zod 4 can normalize the input. */
export const authUrlV1 = z.string().refine(
  value => value === value.trim() && !/[\t\r\n\u00a0\ufeff]/u.test(value),
  "Invalid url",
).pipe(z.url({ error: "Invalid url" }));
