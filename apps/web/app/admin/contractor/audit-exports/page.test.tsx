import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { ReactElement, ReactNode } from "react";

// The same scripted hook harness as contractor-admin: real page handlers, no browser/DOM.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as Array<() => void> }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.cells)) hooks.cells[i] = initial;
    return [hooks.cells[i], (value: unknown) => { hooks.cells[i] = value; }];
  },
  useRef: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.cells)) hooks.cells[i] = { current: initial };
    return hooks.cells[i];
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const i = hooks.cursor++, previous = hooks.cells[i] as { callback: unknown; deps: unknown[] } | undefined;
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) hooks.cells[i] = { callback, deps };
    return (hooks.cells[i] as { callback: unknown }).callback;
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    const i = hooks.cursor++, previous = hooks.cells[i] as unknown[] | undefined;
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous[index]))) hooks.effects.push(effect);
    hooks.cells[i] = deps;
  },
}));
vi.mock("next/link", () => ({ default: "a" }));
import Page from "./page";

type Node = ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>;
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function render() { hooks.cursor = 0; hooks.effects = []; return nodes(Page()); }
const settle = () => new Promise(resolve => setImmediate(resolve));
async function mount() { render(); hooks.effects.forEach(effect => effect()); await settle(); }
async function click(name = "Create signed audit export") {
  const button = render().find(node => node.type === "button" && node.props.children === name)!;
  expect(button).toBeDefined(); expect(button.props.disabled).toBe(false);
  button.props.onClick!(); await settle();
}
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const refused = (code: string, status = 403) => ({ ok: false, status, json: async () => ({ version: "audit-export-error.v1", code }) });
beforeEach(() => { hooks.cells = []; vi.stubGlobal("React", React); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("ENT-10b audit export command retry handlers", () => {
  it.each(["unavailable", "network failure", "unknown error", "unreadable response", "unconfirmed success", "refusal code with 503"])("reuses the command id after %s, including after a persisted-list reload", async fault => {
    const ids: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options?: { method?: string; body?: string }) => {
      if (options?.method !== "POST") return ok({ exports: [] });
      const { commandId } = JSON.parse(options.body!); ids.push(commandId);
      if (ids.length > 1) return ok({ id: commandId });
      if (fault === "unavailable") return refused("AUDIT_EXPORT_UNAVAILABLE", 503);
      if (fault === "network failure") throw new TypeError("fetch failed");
      if (fault === "unknown error") return refused("UNRECOGNIZED_OUTCOME", 409);
      if (fault === "unreadable response") return { ok: true, status: 200, json: async () => { throw new SyntaxError("unreadable"); } };
      if (fault === "unconfirmed success") return ok({});
      return refused("AUDIT_EXPORT_FORBIDDEN", 503);
    }));
    await mount(); await click(); await click("Reload persisted exports"); await click();
    expect(ids).toHaveLength(2); expect(ids[1]).toBe(ids[0]);
  });

  it.each([
    ["AUDIT_EXPORT_FORBIDDEN", 403], ["AUDIT_EXPORT_INVALID_INPUT", 400],
    ["AUDIT_EXPORT_CHECKPOINT_REQUIRED", 409], ["AUDIT_EXPORT_MODE_HELD", 403],
  ] as const)("starts a new command after the definitive %s refusal", async (code, status) => {
    const ids: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options?: { method?: string; body?: string }) => {
      if (options?.method !== "POST") return ok({ exports: [] });
      const { commandId } = JSON.parse(options.body!); ids.push(commandId);
      return ids.length === 1 ? refused(code, status) : ok({ id: commandId });
    }));
    await mount(); await click(); await click();
    expect(ids).toHaveLength(2); expect(ids[1]).not.toBe(ids[0]);
  });

  it("clears the command after confirmed success even when the following list refresh fails", async () => {
    const ids: string[] = []; let failRefresh = false;
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options?: { method?: string; body?: string }) => {
      if (options?.method !== "POST") { if (failRefresh) throw new Error("list unavailable"); return ok({ exports: [] }); }
      const { commandId } = JSON.parse(options.body!); ids.push(commandId); failRefresh = true;
      return ok({ id: commandId });
    }));
    await mount(); await click(); failRefresh = false; await click("Reload persisted exports"); await click();
    expect(ids).toHaveLength(2); expect(ids[1]).not.toBe(ids[0]);
  });
});
