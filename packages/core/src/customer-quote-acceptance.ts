import { z } from "zod";
const uuid = z.guid().transform(value => value.toLowerCase());
export const customerQuoteReadV1 = z.object({ version: z.literal("customer-quote-read.v1"), jobId: uuid }).strict();
/** Customer intent only; session authority, price and acceptance time come from the server. */
export const customerQuoteAcceptanceV1 = z.object({
  version: z.literal("customer-quote-acceptance.v1"), commandId: uuid, jobId: uuid,
  expectedJobRevision: z.number().int().positive(),
  target: z.object({ kind: z.literal("quote"), id: uuid, revision: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
}).strict();
