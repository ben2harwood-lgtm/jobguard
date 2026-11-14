import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { diaryReadV1, JOB_DIARY_NOTICE, JOB_DIARY_NOTICE_VERSION } from "@jobguard/core";
import { renderToStaticMarkup } from "react-dom/server";
import { JobDiary } from "./job-sources";

// The same hook harness used by job-parties.test.tsx exercises handlers without a browser.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: { value?: unknown; current?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[] = [];
  const effects: (() => void)[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; effects.length = 0; },
    render() { cursor = 0; },
    effects() { while (effects.length) effects.shift()!(); },
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useCallback(fn: unknown, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) slots[index] = { value: fn, deps };
      return slots[index]!.value;
    },
    useEffect(fn: () => (() => void) | void, deps: readonly unknown[]) {
      const index = cursor++, old = slots[index];
      if (!old?.deps || !deps.every((v, i) => Object.is(v, old.deps![i]))) {
        slots[index] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[index]!.cleanup = fn() || undefined; });
      }
    },
  };
});
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), ...hooks }));
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });


type Node = React.ReactElement<Record<string, any>>;
function find(node: React.ReactNode, match: (node: Node) => boolean): Node | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, match)).find(Boolean);
  if (!React.isValidElement<Record<string, any>>(node)) return undefined;
  return match(node) ? node : find(node.props.children, match);
}
const jobId = "11111111-1111-4111-8111-111111111111";
async function panel(outcome: () => Promise<unknown>, extrasHref?: string) {
  hooks.reset(); vi.stubGlobal("React", React);
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    if (options?.method === "POST") { commands.push(JSON.parse(options.body)); return outcome(); }
    return { ok: true, json: async () => ({ version: "job-diary-read.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, entries: [], notice: JOB_DIARY_NOTICE, noticeVersion: JOB_DIARY_NOTICE_VERSION }) };
  }));
  const render = () => { hooks.render(); const tree = JobDiary({ jobId, ...(extrasHref ? { extrasHref } : {}) }); hooks.effects(); return tree; };
  render(); await new Promise<void>(resolve => setImmediate(resolve));
  const input = (id: string) => find(render(), n => n.props.id === id)!;
  const checkbox = () => find(render(), n => n.props.type === "checkbox")!;
  const click = async (name: string) => {
    const button = find(render(), n => n.type === "button" && n.props.children === name)!;
    expect(button.props.disabled).not.toBe(true);
    button.props.onClick(); await new Promise<void>(resolve => setImmediate(resolve));
  };
  return { render, input, checkbox, click, commands };
}

describe("SV-7A diary on-site screen", () => {
  it("defaults off, sends the selected flag, and clears text and flag after saving", async () => {
    const p = await panel(async () => ({ ok: true }));
    expect(p.checkbox().props).toMatchObject({ disabled: false, checked: false });
    p.input("diary-text").props.onChange({ target: { value: "Fictional site note" } });
    p.checkbox().props.onChange({ target: { checked: true } });
    await p.click("Save note");
    expect(p.commands[0]).toMatchObject({ onSite: true, text: "Fictional site note" });
    expect(p.input("diary-text").props.value).toBe("");
    expect(p.checkbox().props.checked).toBe(false);
    p.input("diary-text").props.onChange({ target: { value: "Fictional office note" } });
    await p.click("Save note");
    expect(p.commands[1]).toMatchObject({ onSite: false });
  });
  it("retries the saved command including its flag even after the draft is edited", async () => {
    let attempts = 0;
    const p = await panel(async () => { if (++attempts === 1) throw new Error("lost response"); return { ok: true }; });
    p.input("diary-text").props.onChange({ target: { value: "Original fictional note" } });
    p.checkbox().props.onChange({ target: { checked: true } });
    await p.click("Save note");
    p.input("diary-text").props.onChange({ target: { value: "Edited draft" } });
    p.checkbox().props.onChange({ target: { checked: false } });
    await p.click("Retry the same save");
    expect(p.commands).toHaveLength(2);
    expect(p.commands[1]).toEqual(p.commands[0]);
    expect(p.commands[1]).toMatchObject({ onSite: true, text: "Original fictional note" });
    expect(p.checkbox().props.checked).toBe(false);
  });
  it.each([
    ["METER_UPGRADE_REQUIRED", "Your plan has no room"],
    ["METER_PROJECTION_MISMATCH", "record needs checking"],
    ["JOB_WORK_CLOSED", "Work on this job is closed"],
    ["POST_LOCK_WORK_REQUIRES_LINKED_JOB", "final account is locked"],
  ])("explains %s while retaining the draft and flag", async (code, message) => {
    const p = await panel(async () => ({ ok: false, status: 409, json: async () => ({ code }) }));
    p.input("diary-text").props.onChange({ target: { value: "Keep this fictional draft" } });
    p.checkbox().props.onChange({ target: { checked: true } });
    await p.click("Save note");
    expect(find(p.render(), n => n.props.role === "alert")!.props.children).toContain(message);
    expect(p.input("diary-text").props.value).toBe("Keep this fictional draft");
    expect(p.checkbox().props.checked).toBe(true);
  });
});

describe("REAL-DIARY-EXTRA-LINK standing notice", () => {
  it.each(["#variations-title", `/jobs/${jobId}/work#variations-title`])("links the exact phrase to %s without changing the notice text", async extrasHref => {
    const p = await panel(async () => ({ ok: true }), extrasHref);
    const notice = find(p.render(), n => n.props["data-testid"] === "diary-notice")!;
    const link = find(notice, n => n.type === "a")!;
    expect(link.props).toMatchObject({ href: extrasHref, children: "Log an extra" });
    const markup = renderToStaticMarkup(notice);
    expect(markup.replace(/<[^>]*>/gu, "")).toBe(JOB_DIARY_NOTICE);
    expect(markup.match(/<a /gu)).toHaveLength(1);
  });

  it("keeps the identical plain-text notice when no target is supplied", async () => {
    const p = await panel(async () => ({ ok: true }));
    const notice = find(p.render(), n => n.props["data-testid"] === "diary-notice")!;
    expect(notice.props.children).toBe(JOB_DIARY_NOTICE);
    expect(find(notice, n => n.type === "a")).toBeUndefined();
  });

  it("leaves an unrelated notice unchanged even with an extras target", async () => {
    // Simulate a future validated notice; the production evidence schema stays unchanged.
    const parse = diaryReadV1.parse.bind(diaryReadV1);
    const unrelated = "Keep this note for your records. Log an Extra later.";
    vi.spyOn(diaryReadV1, "parse").mockImplementationOnce(raw => ({ ...parse(raw), notice: unrelated as typeof JOB_DIARY_NOTICE }));
    const p = await panel(async () => ({ ok: true }), "#variations-title");
    const notice = find(p.render(), n => n.props["data-testid"] === "diary-notice")!;
    expect(notice.props.children).toBe(unrelated);
    expect(find(notice, n => n.type === "a")).toBeUndefined();
  });
});
