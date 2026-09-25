import { z } from "zod";
export { practiceFeedCommandV1, practiceFeedQueryV1 } from "@jobguard/core";

const safePence = z.number().int().safe().min(0).max(1_000_000_000_000);
export const practiceMovementViewV1 = z.object({
  id: z.string().min(1),
  underlyingMovementId: z.string(),
  grossPence: safePence,
  currency: z.literal("GBP"),
  state: z.enum(["pending", "settled", "possible_duplicate"]),
  allocatedEligibleNetPence: z.literal(0),
  eligibleForAllocation: z.boolean(),
  eventIds: z.array(z.string()),
  sourceHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/u)),
}).strict();

export const practiceFeedResponseV1 = z.object({
  version: z.literal("practice-feed-view.v1"),
  environment: z.literal("synthetic_demo"),
  scenario: z.literal("recovery-18800"),
  realExternalActions: z.literal(0),
  jobId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  feedState: z.enum(["not_connected", "connected", "disconnected"]),
  revision: z.number().int().nonnegative(),
  movements: z.array(practiceMovementViewV1),
  eventCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
}).strict();
export type PracticeFeedResponse = z.infer<typeof practiceFeedResponseV1>;

export const practiceFeedErrorV1 = z.object({
  version: z.literal("practice-feed-error.v1"),
  code: z.string(),
}).strict();
