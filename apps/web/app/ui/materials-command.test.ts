import { describe, expect, it, vi } from "vitest";
import { createMaterialsCommand, materialsCommandFor } from "./materials-command";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe("materials/supplier command serialization", () => {
  it("shares one lock within a job and isolates different jobs", () => {
    expect(materialsCommandFor("a")).toBe(materialsCommandFor("a"));
    expect(materialsCommandFor("a")).not.toBe(materialsCommandFor("b"));
  });
  it("rejects a same-turn dependent action and waits for every reader", async () => {
    const flow = createMaterialsCommand(), committed = deferred<void>(), refreshed = deferred<void>();
    const match = vi.fn(), check = vi.fn(), refreshOther = vi.fn(async () => {});
    flow.register(() => refreshed.promise); flow.register(refreshOther);
    const confirmation = flow.run(() => committed.promise);
    await flow.run(match);
    expect(match).not.toHaveBeenCalled();
    committed.resolve(); await Promise.resolve();
    await flow.run(check);
    expect(check).not.toHaveBeenCalled(); expect(flow.isBusy()).toBe(true);
    refreshed.resolve(); await confirmation;
    expect(refreshOther).toHaveBeenCalledOnce(); expect(flow.isBusy()).toBe(false);
    await flow.run(match); expect(match).toHaveBeenCalledOnce();
  });
  it("discards a read started before a command even when it finishes last", async () => {
    const flow = createMaterialsCommand(), stale = deferred<string>(), apply = vi.fn();
    const oldRead = flow.read("order", () => stale.promise, apply);
    flow.register(() => flow.read("order", async () => "revision-2", apply));
    await flow.run(async () => {});
    stale.resolve("revision-1"); await oldRead;
    expect(apply.mock.calls).toEqual([["revision-2"]]);
  });
  it("discards out-of-order reads within one generation", async () => {
    const flow = createMaterialsCommand(), stale = deferred<string>(), apply = vi.fn();
    const oldRead = flow.read("check", () => stale.promise, apply);
    await flow.read("check", async () => "new", apply);
    stale.resolve("old"); await oldRead;
    expect(apply.mock.calls).toEqual([["new"]]);
  });
  it("invalidates unavailable projections and ignores an obsolete read failure", async () => {
    const flow = createMaterialsCommand(), unavailable = vi.fn(), apply = vi.fn();
    await expect(flow.read("sources", async () => { throw new Error("unavailable"); }, apply, unavailable)).rejects.toThrow("unavailable");
    expect(unavailable).toHaveBeenCalledOnce();
    let reject!: (cause: Error) => void;
    const oldRead = flow.read("sources", () => new Promise<string>((_resolve, fail) => { reject = fail; }), apply, unavailable);
    await flow.read("sources", async () => "confirmed", apply, unavailable);
    reject(new Error("obsolete")); await oldRead;
    expect(unavailable).toHaveBeenCalledOnce(); expect(apply).toHaveBeenCalledWith("confirmed");
  });
  it.each(["command", "refresh"])("releases on %s failure and surfaces the error", async phase => {
    const flow = createMaterialsCommand();
    if (phase === "refresh") flow.register(async () => { throw new Error("failed"); });
    await expect(flow.run(async () => { if (phase === "command") throw new Error("failed"); })).rejects.toThrow("failed");
    expect(flow.isBusy()).toBe(false);
  });
});
