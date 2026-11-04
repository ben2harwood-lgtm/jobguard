import type { TaskList } from "graphile-worker";
import { z } from "zod";

export const extraEscalationTaskV1 = z.object({
  version: z.literal("extra-escalation-task.v1"), tenantId: z.string().uuid(),
}).strict();
export type ExtraEscalationTask = z.infer<typeof extraEscalationTaskV1>;
export class ExtraEscalationTaskError extends Error {
  constructor(readonly code: "INVALID_EXTRA_ESCALATION_TASK" | "EXTRA_ESCALATION_ALREADY_REGISTERED") {
    super(code); this.name = "ExtraEscalationTaskError";
  }
}

/** Scheduling is dark outside the existing synthetic practice environment. */
export function registerExtraEscalationTasks(tasks: TaskList, environment: string,
  execute: (payload: ExtraEscalationTask) => Promise<unknown>, now: () => number = Date.now): string {
  if (environment !== "synthetic_demo") return "";
  if (Object.hasOwn(tasks, "discover_extra_escalations") || Object.hasOwn(tasks, "escalate_overdue_extras"))
    throw new ExtraEscalationTaskError("EXTRA_ESCALATION_ALREADY_REGISTERED");
  tasks.discover_extra_escalations = async (_payload, helpers) => {
    const rows = await helpers.withPgClient(client => client.query<{tenant_id: string}>(
      "SELECT tenant_id FROM infrastructure.discover_extra_escalations()"));
    const bucket = Math.floor(now() / 60_000);
    for (const row of rows.rows) {
      const payload = extraEscalationTaskV1.parse({version: "extra-escalation-task.v1", tenantId: row.tenant_id});
      await helpers.addJob("escalate_overdue_extras", payload,
        {jobKey: `extra-escalation:${payload.tenantId}:${bucket}`, jobKeyMode: "preserve_run_at"});
    }
  };
  tasks.escalate_overdue_extras = async payload => {
    const parsed = extraEscalationTaskV1.safeParse(payload);
    if (!parsed.success) throw new ExtraEscalationTaskError("INVALID_EXTRA_ESCALATION_TASK");
    await execute(parsed.data);
  };
  return "*/1 * * * * discover_extra_escalations";
}
