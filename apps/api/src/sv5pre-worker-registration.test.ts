import { sourceFixtureUrl } from "./source-fixture-url.js";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { TaskList } from "graphile-worker";
import type { ScheduledPlan } from "./readiness-scheduler.js";
import { registerFinalCheckTask } from "./worker-task-extensions.js";
import { executeFinalCheckTask } from "./final-check-task-executor.js";

const { testTenantContext } = await import(sourceFixtureUrl("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const unavailablePorts = { read: vi.fn(async () => { throw new Error("FINAL_CHECK_FORBIDDEN"); }), execute: vi.fn(), publish: vi.fn() };
const task = {
  version: "final-check-task.v1", tenantId: "10000000-0000-4000-8000-000000000001",
  jobId: "10000000-0000-4000-8000-000000000002", lockId: "10000000-0000-4000-8000-000000000003",
  manifestId: "10000000-0000-4000-8000-000000000004", executionId: "10000000-0000-4000-8000-000000000005",
};

describe("SV5PRE final-check registration", () => {
  it("PRE-Q6-01 the executable worker registers only the fixed strict final-check task", async () => {
    const callback = vi.fn(async () => undefined), tasks: TaskList = {};
    registerFinalCheckTask(tasks, callback);
    expect(Object.keys(tasks)).toEqual(["final_check"]);
    const handler = tasks.final_check!;
    // The extension itself uses no Graphile helper; malformed input never reaches the context callback.
    const helpers = {} as Parameters<typeof handler>[1];
    for (const invalid of [null, {}, { ...task, version: "v2" }, { ...task, jobId: "invalid" },
      { ...task, tenantId: "invalid" }, { ...task, lockId: "invalid" }, { ...task, manifestId: "invalid" },
      { ...task, executionId: "invalid" }, { ...task, approved: true }, { ...task, headers: {} }]) {
      await expect(handler(invalid, helpers)).rejects.toMatchObject({ code: "INVALID_FINAL_CHECK_TASK" });
    }
    expect(callback).not.toHaveBeenCalled();
    await handler(task, helpers);
    expect(callback).toHaveBeenCalledExactlyOnceWith(task);
  });

  it("PRE-Q6-01 actual worker composition installs the strict task before the Graphile runner", async () => {
    const registered = vi.fn(async (..._args: unknown[]) => ({ stop: vi.fn() }));
    const scope = { tenantId: task.tenantId, jobId: task.jobId, taskId: task.executionId };
    const plan: ScheduledPlan = { version: "readiness-scheduled-plan.v1", synthetic: true, scope, factRevision: 1,
      ruleRevision: "readiness-scheduled.v1", status: "confirmed", plannedDate: "2026-11-05", jurisdiction: "england-and-wales",
      localTime: "09:00", timeZone: "Europe/London", predecessors: [], edges: [],
      material: { requiredUnits: 1, landedUnits: 1 }, access: false, crew: true };
    const candidate = { ...plan, scope: { ...scope, taskId: task.manifestId }, plannedDate: "2026-11-06", access: true };
    const load = vi.fn(async (..._args: unknown[]) => plan);
    const loadJobPlans = vi.fn(async (..._args: unknown[]) => [candidate]);
    const recordProposal = vi.fn(async (..._args: unknown[]) => undefined);
    vi.doMock("./readiness-store.js", () => ({ DurableReadinessStore: class { load = load; loadJobPlans = loadJobPlans; recordProposal = recordProposal; } }));
    const queries = vi.fn(async () => ({ rows: [{ safe: true }] }));
    const begin = vi.fn(async (..._args: unknown[]) => { throw new Error("FINAL_CHECK_FORBIDDEN"); });
    vi.doMock("pg", () => ({ Pool: class { query = queries; end = async () => undefined; } }));
    vi.doMock("graphile-worker", async () => ({ ...await vi.importActual<Record<string, unknown>>("graphile-worker"), run: registered }));
    vi.doMock("@jobguard/db", async () => ({
      ...await vi.importActual<Record<string, unknown>>("@jobguard/db"),
      ActionExecutor: class { execute = async () => undefined; },
      ShadowObservationReader: class { assertTermsRelation = async () => undefined; },
      ShadowDetectionRepository: class {}, FixtureObservationSources: class {},
      FinalCheckRepository: class { manifest = unavailablePorts.read; begin = begin; },
    }));
    const listeners = vi.spyOn(process, "once").mockReturnValue(process);
    for (const name of ["GRAPHILE_DATABASE_URL", "RUNTIME_DATABASE_URL", "SHADOW_DATABASE_URL"]) vi.stubEnv(name, "postgresql://localhost/sv5pre");
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    try {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-04T10:00:00.000Z"));
      vi.resetModules(); await import("./worker.js");
      expect(registered).toHaveBeenCalledTimes(1);
      const options = registered.mock.calls[0]![0] as { taskList: TaskList };
      expect(options.taskList.final_check).toBeTypeOf("function");
      const handler = options.taskList.final_check!, helpers = {} as Parameters<typeof handler>[1];
      await expect(handler({ ...task, completed: true }, helpers)).rejects.toMatchObject({ code: "INVALID_FINAL_CHECK_TASK" });
      await expect(handler(task, helpers)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
      const practice=options.taskList.final_check_practice_run!;
      const original={version:"final-check-practice-run.v1",tenantId:task.tenantId,jobId:task.jobId,lockId:task.lockId};
      await expect(practice(original,helpers)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
      expect(begin.mock.calls.at(-1)?.slice(1)).toEqual([task.jobId,"shadow-detection.v1",undefined,1,task.lockId]);
      await expect(practice({...original,manifestId:task.manifestId,attempt:2},helpers)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
      expect(begin.mock.calls.at(-1)?.slice(1)).toEqual([task.jobId,"shadow-detection.v1",task.manifestId,2,task.lockId]);
      await expect(practice({...original,attempt:2},helpers)).rejects.toThrow();
      expect(begin).toHaveBeenCalledTimes(2);
      // Execute the real worker's schedule/evaluate composition, rather than a test binding.
      const addJob = vi.fn(async (..._args: unknown[]) => ({}));
      await options.taskList.readiness_schedule!({ version: "readiness-schedule-task.v1", scope },
        { addJob } as unknown as Parameters<typeof handler>[1]);
      expect(addJob).toHaveBeenCalledTimes(1);
      await options.taskList.readiness_evaluate!(addJob.mock.calls[0]![1], helpers);
      const queuedContext = load.mock.calls.at(-1)![0];
      expect(queuedContext).toMatchObject({ tenantId: scope.tenantId });
      expect(loadJobPlans).toHaveBeenCalledExactlyOnceWith(queuedContext, scope);
      expect(recordProposal).toHaveBeenCalledExactlyOnceWith(queuedContext, expect.objectContaining({
        ready: false, resequence: [{ taskId: candidate.scope.taskId, fromDate: candidate.plannedDate, toDate: plan.plannedDate }],
        status: "proposal", programmeChanged: false, feeEligible: false, recoveryFeePence: 0,
      }));
      const discovery=options.taskList.discover_final_check_requests!;
      const request={lock_id:task.lockId,tenant_id:task.tenantId,job_id:task.jobId,manifest_id:task.manifestId,attempt:2};
      for(const fail of [false,true]){
        const statements:string[]=[];
        const query=vi.fn(async(sql:string,_values?:unknown[])=>{
          statements.push(sql);
          if(sql.startsWith("SELECT lock_id"))return {rows:[request]};
          if(fail&&sql.includes("graphile_worker.add_job"))throw new Error("QUEUE_UNAVAILABLE");
          return {rows:[]};
        });
        const discoveryHelpers={withPgClient:async(fn:(client:unknown)=>Promise<unknown>)=>fn({query})} as unknown as Parameters<typeof discovery>[1];
        if(fail){await expect(discovery({},discoveryHelpers)).rejects.toThrow("QUEUE_UNAVAILABLE");expect(statements.at(-1)).toBe("ROLLBACK");expect(statements.some(sql=>sql.startsWith("UPDATE"))).toBe(false);}
        else{await discovery({},discoveryHelpers);expect(statements[0]).toBe("BEGIN");expect(statements.at(-1)).toBe("COMMIT");expect(statements[2]).toContain("graphile_worker.add_job");expect(statements[3]).toContain("UPDATE infrastructure.final_check_request");expect(query.mock.calls[2]?.[1]).toEqual([JSON.stringify({version:"final-check-practice-run.v1",tenantId:task.tenantId,jobId:task.jobId,lockId:task.lockId,manifestId:task.manifestId,attempt:2}),`final-check-practice:${task.manifestId}`]);expect(query.mock.calls[3]?.[1]).toEqual([task.lockId,2,task.manifestId]);}
      }
    } finally {
      vi.useRealTimers(); vi.doUnmock("./readiness-store.js");
      listeners.mockRestore(); vi.unstubAllEnvs(); vi.doUnmock("pg"); vi.doUnmock("graphile-worker"); vi.doUnmock("@jobguard/db"); vi.resetModules();
    }
  });

  it("PRE-Q6-02 registration preserves the sole queued constructor", async () => {
    const context = testTenantContext(task.tenantId);
    await expect(executeFinalCheckTask(context, task, unavailablePorts, "synthetic_demo")).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
    await expect(executeFinalCheckTask(testTenantContext(task.jobId), task, unavailablePorts, "synthetic_demo")).rejects.toMatchObject({ code: "FINAL_CHECK_TASK_TENANT_MISMATCH" });
    // Inspect the new modules' import boundaries, without pinning any shared file's bytes or hashes.
    const ts = await import("typescript");
    for (const name of ["worker-task-extensions.ts", "final-check-task-executor.ts"]) {
      const source = ts.createSourceFile(name, await readFile(sourceFixtureUrl(name, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly) {
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
          expect((element.propertyName ?? element.name).text).not.toMatch(/^verifiedTenantContext/u);
        }
      }
    }
  });

  it("PRE-Q6-05 extension registration preserves existing tasks", async () => {
    const discover = vi.fn(async () => undefined), outbox = vi.fn(async () => undefined), detection = vi.fn(async () => undefined);
    const tasks: TaskList = { discover_outbox: discover, execute_outbox: outbox, detect_shadow_evidence: detection };
    registerFinalCheckTask(tasks, async () => undefined);
    expect(tasks.discover_outbox).toBe(discover); expect(tasks.execute_outbox).toBe(outbox); expect(tasks.detect_shadow_evidence).toBe(detection);
    expect(Object.keys(tasks)).toEqual(["discover_outbox", "execute_outbox", "detect_shadow_evidence", "final_check"]);
    expect(() => registerFinalCheckTask(tasks, async () => undefined)).toThrow("FINAL_CHECK_TASK_ALREADY_REGISTERED");
    expect(tasks.discover_outbox).toBe(discover);
  });

  it("PRE-Q6-04 the installed executor rejects unavailable manifests without a successful result", async () => {
    const context = testTenantContext(task.tenantId);
    await expect(executeFinalCheckTask(context, task, unavailablePorts, "synthetic_demo")).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
    await expect(executeFinalCheckTask(context, { ...task, completed: true }, unavailablePorts, "synthetic_demo")).rejects.toMatchObject({ code: "INVALID_FINAL_CHECK_TASK" });
  });
});
