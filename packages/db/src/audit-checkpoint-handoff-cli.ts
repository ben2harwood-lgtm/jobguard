import { pathToFileURL } from "node:url";
import { z } from "zod";
import { AuditCheckpointHandoffError, runAuditCheckpointHandoff } from "./audit-checkpoint-handoff.js";

const environmentV1 = z.object({ JOBGUARD_ENV: z.literal("synthetic_demo"), MIGRATION_DATABASE_URL: z.string().url() });
const argumentsV1 = z.object({ operator: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/u), tenantId: z.string().uuid().optional() }).strict();
/** Returns an exit status and emits exactly one JSON line; driver errors are never printed. */
export async function runAuditCheckpointHandoffCli(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env, emit: (line: string) => void = line => { process.stdout.write(line); }): Promise<number> {
  try {
    const values: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i], value = args[i + 1], field = flag === "--operator" ? "operator" : flag === "--tenant" ? "tenantId" : undefined;
      if (!field || value === undefined || values[field] !== undefined) throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_INVALID_INPUT");
      values[field] = value;
    }
    const argumentsResult = argumentsV1.safeParse(values);
    if (!argumentsResult.success) throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_INVALID_INPUT");
    if (env.JOBGUARD_ENV !== "synthetic_demo") throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_MODE_HELD");
    const environment = environmentV1.safeParse(env);
    if (!environment.success) throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_TARGET_FORBIDDEN");
    const result = await runAuditCheckpointHandoff({ ownerUrl: environment.data.MIGRATION_DATABASE_URL, operator: argumentsResult.data.operator,
      ...(argumentsResult.data.tenantId === undefined ? {} : { tenantId: argumentsResult.data.tenantId }) });
    const ok = result.outcomes.every(o => o.outcome !== "failed");
    emit(`${JSON.stringify({ ok, environment: "synthetic_demo", ...result, outcomes: result.outcomes.map(o => o.outcome === "unchanged" ? { ...o, message: "nothing to do" } : o) })}\n`);
    return ok ? 0 : 1;
  } catch (error) {
    const typed = error instanceof AuditCheckpointHandoffError ? error : new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_UNAVAILABLE");
    emit(`${JSON.stringify({ ok: false, code: typed.code, ...(typed.code === "AUDIT_CHECKPOINT_FORBIDDEN" && typed.message !== typed.code ? { message: typed.message } : {}) })}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runAuditCheckpointHandoffCli();
