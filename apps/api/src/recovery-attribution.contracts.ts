import { z } from "zod";
import { recoveryAttributionRevisionV1 } from "@jobguard/core";
export { recoveryAttributionCommandV1 } from "@jobguard/core";
export const recoveryAttributionReadQueryV1 = z.object({}).strict();
/** Historical storage is a proposal, never current qualification or a fee illustration. */
export const recoveryAttributionHistoryV1 = z.object({
 version:z.literal("recovery-attribution-history.v1"),jobId:z.string().uuid(),
 environment:z.literal("synthetic_demo"),proposed:z.literal(true),principalOnly:z.literal(true),
 productionEnabled:z.literal(false),realExternalActions:z.literal(0),
 qualification:z.literal("dependency_bound"),revisions:z.array(recoveryAttributionRevisionV1).readonly(),
}).strict().readonly();
