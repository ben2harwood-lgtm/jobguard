import { z } from "zod";
export const debitPracticeActionV1 = z.object({ version: z.literal("debit-practice-action.v1"), step: z.number().int().min(0).max(30) }).strict();
export const debitPracticeViewV1 = z.object({
  version: z.literal("debit-practice-view.v1"), mandate: z.string(), blocksNewCollection: z.boolean(),
  history: z.array(z.object({ sequence: z.number().int(), label: z.string(), current: z.boolean() }).strict()),
  payments: z.array(z.object({ label: z.string(), state: z.string() }).strict()),
  nextAction: debitPracticeActionV1.nullable(),
}).strict();
export type DebitPracticeView = z.infer<typeof debitPracticeViewV1>;
