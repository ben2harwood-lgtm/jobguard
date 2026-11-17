import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { TaskList } from "graphile-worker";
import { registerFinalCheckTask } from "./worker-task-extensions.js";
import { executeFinalCheckTask, FinalCheckTaskError } from "./final-check-task-executor.js";

const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
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
    const queries = vi.fn(async () => ({ rows: [{ safe: true }] }));
    vi.doMock("pg", () => ({ Pool: class { query = queries; end = async () => undefined; } }));
    vi.doMock("graphile-worker", () => ({ run: registered }));
    vi.doMock("@jobguard/db", async () => ({
      ...await vi.importActual<Record<string, unknown>>("@jobguard/db"),
      ActionExecutor: class { execute = async () => undefined; },
      ShadowObservationReader: class { assertTermsRelation = async () => undefined; },
      ShadowDetectionRepository: class {}, FixtureObservationSources: class {},
    }));
    const listeners = vi.spyOn(process, "once").mockReturnValue(process);
    for (const name of ["GRAPHILE_DATABASE_URL", "RUNTIME_DATABASE_URL", "SHADOW_DATABASE_URL"]) vi.stubEnv(name, "postgresql://localhost/sv5pre");
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    try {
      vi.resetModules(); await import("./worker.js");
      expect(registered).toHaveBeenCalledTimes(1);
      const options = registered.mock.calls[0]![0] as { taskList: TaskList };
      expect(options.taskList.final_check).toBeTypeOf("function");
      const handler = options.taskList.final_check!, helpers = {} as Parameters<typeof handler>[1];
      await expect(handler({ ...task, completed: true }, helpers)).rejects.toMatchObject({ code: "INVALID_FINAL_CHECK_TASK" });
      await expect(handler(task, helpers)).rejects.toMatchObject({ code: "FINAL_CHECK_HANDLER_NOT_INSTALLED" });
    } finally {
      listeners.mockRestore(); vi.unstubAllEnvs(); vi.doUnmock("pg"); vi.doUnmock("graphile-worker"); vi.doUnmock("@jobguard/db"); vi.resetModules();
    }
  });

  it("PRE-Q6-02 registration preserves the sole queued constructor", async () => {
    const context = testTenantContext(task.tenantId);
    await expect(executeFinalCheckTask(context, task)).rejects.toBeInstanceOf(FinalCheckTaskError);
    await expect(executeFinalCheckTask(context, task)).rejects.toMatchObject({ code: "FINAL_CHECK_HANDLER_NOT_INSTALLED" });
    await expect(executeFinalCheckTask(testTenantContext(task.jobId), task)).rejects.toMatchObject({ code: "FINAL_CHECK_TASK_TENANT_MISMATCH" });
    // Inspect the new modules' import boundaries, without pinning any shared file's bytes or hashes.
    const ts = await import("typescript");
    for (const name of ["worker-task-extensions.ts", "final-check-task-executor.ts"]) {
      const source = ts.createSourceFile(name, await readFile(new URL(name, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
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

  it("PRE-Q6-04 the uninstalled executor rejects without a successful result", async () => {
    const context = testTenantContext(task.tenantId);
    await expect(executeFinalCheckTask(context, task)).rejects.toMatchObject({ code: "FINAL_CHECK_HANDLER_NOT_INSTALLED" });
    await expect(executeFinalCheckTask(context, { ...task, completed: true })).rejects.toMatchObject({ code: "INVALID_FINAL_CHECK_TASK" });
  });
});
