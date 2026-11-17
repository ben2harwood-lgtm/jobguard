import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";

const pence = z.number().int().nonnegative().max(MAX_MONEY_PENCE);

/** Highest sent is zero when no immutable revision has an outbound send record. */
export function isSmallJobV3(acceptedNetPence: number, highestSentNetPence: number): boolean {
  return Math.max(pence.parse(acceptedNetPence), pence.parse(highestSentNetPence)) < 200_000;
}
