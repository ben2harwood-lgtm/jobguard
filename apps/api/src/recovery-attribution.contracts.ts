import { z as legacyZ } from "zod";
import { z } from "zod/v4";
import { recoveryAttributionRevisionV1 } from "@jobguard/core";
export { recoveryAttributionCommandV1 } from "@jobguard/core";
export const recoveryAttributionReadQueryV1 = legacyZ.object({}).strict();
/** Historical storage is a proposal, never current qualification or a fee illustration. */
export const recoveryAttributionHistoryV1 = legacyZ.object({
 version:legacyZ.literal("recovery-attribution-history.v1"),jobId:legacyZ.custom<string>(value=>z.guid({ error: "Invalid uuid" }).safeParse(value).success, "Invalid uuid"),
 environment:legacyZ.literal("synthetic_demo"),proposed:legacyZ.literal(true),principalOnly:legacyZ.literal(true),
 productionEnabled:legacyZ.literal(false),realExternalActions:legacyZ.literal(0),
 qualification:legacyZ.literal("dependency_bound"),revisions:legacyZ.array(recoveryAttributionRevisionV1).readonly(),
}).strict().readonly();
