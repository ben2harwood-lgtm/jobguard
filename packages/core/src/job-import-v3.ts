import { z } from "zod";
import { isSmallJobV3 } from "./activation-v3.js";
import { IMPORT_LINEAGE_LABEL } from "./job-import.js";
import { MAX_MONEY_PENCE } from "./money.js";

export const JOB_IMPORT_V3_LINEAGE_LABEL = IMPORT_LINEAGE_LABEL;

export class JobImportV3Error extends Error {
  readonly code = "INVALID_JOB_IMPORT_V3_INPUT" as const;
  constructor() {
    super("INVALID_JOB_IMPORT_V3_INPUT");
    this.name = "JobImportV3Error";
  }
}

const uuid = z.string().uuid().transform(value => value.toLowerCase());

/** Public intent only. The held server adapter must resolve this key in its fictional fixture registry. */
export const jobImportV3Request = z.object({
  version: z.literal("adopt-job.v3"),
  commandId: uuid,
  expectedSourcePartyBindingId: uuid,
  lifecyclePoint: z.enum(["live", "invoiced"]),
  fictionalBaselineKey: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
}).strict().readonly();
export type JobImportV3Request = z.infer<typeof jobImportV3Request>;

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new JobImportV3Error();
  return parsed.data;
}

export function parseJobImportV3Request(raw: unknown): JobImportV3Request {
  return parse(jobImportV3Request, raw);
}

/** Canonical text only: authenticates nobody and stores no replay receipt or result. */
export function jobImportV3RequestIdentity(raw: unknown, sourceJobId: string, actorMembershipId: string): string {
  const request = parseJobImportV3Request(raw);
  return JSON.stringify([
    request.version, parse(uuid, sourceJobId), parse(uuid, actorMembershipId),
    request.commandId, request.expectedSourcePartyBindingId, request.lifecyclePoint, request.fictionalBaselineKey,
  ]);
}

const pence = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
const knownValues = z.object({
  version: z.literal("job-import-known-values.v1"),
  acceptedNetPence: pence,
  highestSentNetPence: pence,
}).strict().readonly();

/** Explicit numeric reference inputs only; no provenance, unknown-value policy, terms or place allocation. */
export function classifyKnownJobImportV3Values(raw: unknown) {
  const values = parse(knownValues, raw);
  return Object.freeze({ ...values, smallJob: isSmallJobV3(values.acceptedNetPence, values.highestSentNetPence) });
}
