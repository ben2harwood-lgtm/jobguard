import { z } from "zod";
export const jobWorkStateReadQueryV1=z.object({version:z.literal("job-work-state-read-query.v1").optional()}).strict();

export { jobWorkStateMutationV1 } from "@jobguard/core";
