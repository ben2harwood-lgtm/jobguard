import { readFileSync } from "node:fs";
import type { Task, TaskList } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import { registerExtraEscalationTasks } from "./extra-escalation-task.js";
import { redactingTasks } from "./safe-logging.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const payload = {version: "extra-escalation-task.v1", tenantId};
function setup(environment = "synthetic_demo", now = () => 120_000) {
  const tasks: TaskList = {}, execute = vi.fn(async () => []);
  const crontab = registerExtraEscalationTasks(tasks, environment, execute, now);
  const query = vi.fn(async () => ({rows: [{tenant_id: tenantId}]}));
  const addJob = vi.fn(async (_name: string, _payload: unknown, _options: unknown) => undefined);
  const helpers = {withPgClient: async (fn: (client: {query: typeof query}) => unknown) => fn({query}), addJob} as unknown as Parameters<Task>[1];
  return {tasks, execute, crontab, query, addJob, helpers};
}
describe("ENT-5 synthetic escalation scheduling", () => {
  it("registers both tasks and only schedules discovery in synthetic practice", () => {
    const s = setup();
    expect(Object.keys(s.tasks).sort()).toEqual(["discover_extra_escalations", "escalate_overdue_extras"]);
    expect(s.crontab).toBe("*/1 * * * * discover_extra_escalations");
    for (const environment of ["disabled", "production", "pilot_no_charge", ""]) {
      const off = setup(environment); expect(off.tasks).toEqual({}); expect(off.crontab).toBe("");
    }
    expect(() => registerExtraEscalationTasks(s.tasks, "synthetic_demo", s.execute)).toThrow("EXTRA_ESCALATION_ALREADY_REGISTERED");
    const worker = readFileSync(new URL("./worker.ts", import.meta.url), "utf8");
    expect(worker).toContain("registerExtraEscalationTasks(tasks,finalCheckEnvironment");
    expect(worker).toContain("escalateOverdueExtrasTask(runtimePool,queueContext({tenantId:parsed.tenantId}))");
    expect(worker).toContain("practiceOnly?{...extraEscalationTasks,");
    expect(worker).toContain('extraEscalationCrontab].filter(Boolean).join("\\n")');
  });
  it("discovers identifiers only and coalesces repeated ticks by tenant and minute", async () => {
    let clock = 120_000;
    const s = setup("synthetic_demo", () => clock);
    await s.tasks.discover_extra_escalations!({}, s.helpers);
    await s.tasks.discover_extra_escalations!({}, s.helpers);
    expect(s.query).toHaveBeenCalledWith("SELECT tenant_id FROM infrastructure.discover_extra_escalations()");
    expect(s.addJob).toHaveBeenNthCalledWith(1, "escalate_overdue_extras", payload,
      {jobKey: `extra-escalation:${tenantId}:2`, jobKeyMode: "preserve_run_at"});
    expect(s.addJob.mock.calls[1]).toEqual(s.addJob.mock.calls[0]);
    clock += 60_000; await s.tasks.discover_extra_escalations!({}, s.helpers);
    expect(s.addJob.mock.calls[2]?.[2]).toMatchObject({jobKey: `extra-escalation:${tenantId}:3`});
    expect(s.execute).not.toHaveBeenCalled();
    await s.tasks.escalate_overdue_extras!(payload, s.helpers);
    expect(s.execute).toHaveBeenCalledExactlyOnceWith(payload);
  });
  it("refuses extra authority, malformed tenant IDs and unknown versions before execution", async () => {
    const s = setup();
    for (const raw of [{...payload, actor: tenantId}, {...payload, time: 0}, {...payload, tenantId: "forged"},
      {...payload, version: "extra-escalation-task.v2"}, {tenantId}, null])
      await expect(s.tasks.escalate_overdue_extras!(raw, s.helpers)).rejects.toThrow("INVALID_EXTRA_ESCALATION_TASK");
    expect(s.execute).not.toHaveBeenCalled();
  });
  it("uses the worker's existing error redaction", async () => {
    const s = setup(); s.execute.mockRejectedValueOnce(new Error("private fixture canary"));
    await expect(redactingTasks(s.tasks).escalate_overdue_extras!(payload, s.helpers)).rejects.toThrow("WORKER_TASK_FAILED");
  });
});
