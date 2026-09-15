import { z } from "zod";
import { bootstrapSyntheticDemo } from "./demo-bootstrap.js";

const environment = z.object({
  JOBGUARD_ENV: z.literal("synthetic_demo"), DATABASE_URL: z.string().url(), MIGRATION_DATABASE_URL: z.string().url(),
}).parse(process.env);
const result = await bootstrapSyntheticDemo({ ownerUrl: environment.MIGRATION_DATABASE_URL, runtimeUrl: environment.DATABASE_URL });
process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
