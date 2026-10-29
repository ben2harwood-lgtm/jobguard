import { z } from "zod";

/** Preserve Zod 3 URL acceptance and the original, unnormalized string. */
export const authUrlV1 = z.string().refine(value => URL.canParse(value), "Invalid url");
