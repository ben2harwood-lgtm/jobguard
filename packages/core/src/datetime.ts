import { z } from "zod";

// Preserve the versioned Zod 3 timestamp language: seconds are optional, fractions are unbounded,
// and offset syntax is checked independently of its range by the consuming contract.
const dateAndTime = `${z.regexes.date.source.slice(1, -1)}T${z.regexes.time({}).source.slice(1, -1)}`;
export const utcDatetimeV1 = z.string().regex(new RegExp(`^${dateAndTime}Z$`), "Invalid datetime");
export const offsetDatetimeV1 = z.string().regex(new RegExp(`^${dateAndTime}(Z|[+-]\\d{2}:?\\d{2})$`), "Invalid datetime");
