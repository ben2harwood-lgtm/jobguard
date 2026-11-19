import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WalkIt } from "./jobguard-app";
import { LocalDictation } from "./local-dictation";

// Exercise the real component's handlers using the established review-proposal harness.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const slots: any[] = [];
  return {
    reset() { cursor = 0; slots.length = 0; },
    render() { cursor = 0; },
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
  };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
type Node = React.ReactElement<Record<string, any>>;
function all(tree: React.ReactNode, match: (node: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => all(child, match));
  if (!React.isValidElement<Record<string, any>>(tree)) return [];
  return [...(match(tree) ? [tree] : []), ...all(tree.props.children, match)];
}
function text(tree: React.ReactNode): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (React.isValidElement<Record<string, any>>(tree)) return text(tree.props.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
const firstSource = "Fictional room. Protect room £200.00.";
const editedSource = "Fictional room. Protect room £250.00.";
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
type CaptureBody = { captureId: string; source: { kind: string; text: string; acquisition?: unknown }; [key: string]: unknown };

function captureServer() {
  const saved = new Map<string, { snapshot: string; result: Record<string, unknown> }>();
  const requests: CaptureBody[] = [];
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as CaptureBody;
    requests.push(body);
    const { captureId, ...input } = body;
    const snapshot = JSON.stringify(input);
    const existing = saved.get(captureId);
    if (existing && existing.snapshot !== snapshot) return new Response(JSON.stringify({ code: "CAPTURE_ID_REUSED" }), { status: 409 });
    const result = existing?.result ?? {
      jobId: `job-${saved.size + 1}`,
      source: body.source,
      proposal: { lines: [{ description: { value: body.source.text }, unitPricePence: { value: 20000 } }], questions: [] },
    };
    saved.set(captureId, { snapshot, result });
    return new Response(JSON.stringify(result), { status: 201 });
  });
  vi.stubGlobal("fetch", fetcher);
  return { saved, requests, fetcher };
}
function panel() {
  const captured = vi.fn();
  const render = () => { hooks.render(); return WalkIt({ tenantId: "tenant", initialText: firstSource, close: vi.fn(), onCaptured: captured }); };
  const source = (tree: React.ReactNode) => all(tree, node => node.type === "textarea")[0]!;
  const button = (tree: React.ReactNode) => all(tree, node => node.type === "button" && text(node.props.children) === "Make my draft")[0]!;
  const edit = (value: string) => source(render()).props.onChange({ target: { value } });
  const submit = async () => { button(render()).props.onClick(); await flush(); };
  return { render, source, button, edit, submit, captured };
}
beforeEach(() => { hooks.reset(); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());

it("makes a new draft from edited source, preserves earlier drafts, and reuses each exact submitted snapshot", async () => {
  const server = captureServer(), p = panel();
  await p.submit();
  expect(text(p.render())).toContain("Your draft is ready");
  p.edit(editedSource);
  expect(text(p.render())).not.toContain("Check and edit my draft");
  expect(text(p.render())).toContain("Previously saved drafts stay in Jobs");
  await p.submit();
  expect(text(p.render())).toContain("Your draft is ready");
  expect(p.captured).toHaveBeenLastCalledWith(expect.objectContaining({ jobId: "job-2", source: expect.objectContaining({ text: editedSource }) }));
  expect(server.requests[1]!.captureId).not.toBe(server.requests[0]!.captureId);
  await p.submit();
  expect(server.requests[2]).toEqual(server.requests[1]);
  p.edit(firstSource);
  await p.submit();
  expect(server.requests[3]).toEqual(server.requests[0]);
  expect(server.saved.size).toBe(2);
  expect(server.saved.get(server.requests[0]!.captureId)!.result.source).toMatchObject({ text: firstSource });
});

it("reuses the full request after a lost response without making another saved draft", async () => {
  const server = captureServer(), p = panel();
  const persist = server.fetcher.getMockImplementation()!;
  server.fetcher.mockImplementationOnce(async (...args) => { await persist(...args); throw new Error("Connection lost after save"); });
  await p.submit();
  expect(text(p.render())).toContain("Your original text is still here");
  expect(p.source(p.render()).props.value).toBe(firstSource);
  await p.submit();
  expect(server.requests[1]).toEqual(server.requests[0]);
  expect(server.saved.size).toBe(1);
  expect(p.captured).toHaveBeenLastCalledWith(expect.objectContaining({ jobId: "job-1" }));
});

it("suppresses same-tick double clicks while the first draft request is pending", async () => {
  const server = captureServer(), p = panel();
  const persist = server.fetcher.getMockImplementation()!;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  server.fetcher.mockImplementationOnce(async (...args) => { await pending; return persist(...args); });
  const button = p.button(p.render());
  button.props.onClick(); button.props.onClick();
  expect(server.fetcher).toHaveBeenCalledTimes(1);
  expect(p.button(p.render()).props.disabled).toBe(true);
  expect(p.source(p.render()).props.disabled).toBe(true);
  p.edit(editedSource);
  all(p.render(), node => node.type === LocalDictation)[0]!.props.onUse(editedSource, editedSource);
  expect(p.source(p.render()).props.value).toBe(firstSource);
  release(); await flush();
  expect(server.saved.size).toBe(1);
  expect(p.button(p.render()).props.disabled).toBe(false);
});

it("includes dictation provenance in capture identity even when the edited text is unchanged", async () => {
  const server = captureServer(), p = panel();
  await p.submit();
  all(p.render(), node => node.type === LocalDictation)[0]!.props.onUse(firstSource, firstSource);
  await p.submit();
  all(p.render(), node => node.type === LocalDictation)[0]!.props.onUse(firstSource, "Original local transcript");
  await p.submit();
  expect(server.saved.size).toBe(3);
  expect(new Set(server.requests.map(request => request.captureId)).size).toBe(3);
  expect(server.requests[1]!.source.acquisition).toMatchObject({ rawFinalText: firstSource, humanEdited: false });
  expect(server.requests[2]!.source.acquisition).toMatchObject({ rawFinalText: "Original local transcript", humanEdited: true });
});

it("keeps source and gives a recovery step for a typed conflict instead of inviting the same conflicting retry", async () => {
  captureServer();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "CAPTURE_ID_REUSED" }), { status: 409 })));
  const p = panel();
  await p.submit();
  expect(p.source(p.render()).props.value).toBe(firstSource);
  expect(text(p.render())).toContain("Copy your text before returning to Jobs");
  expect(text(p.render())).not.toContain("DATABASE_UNAVAILABLE");
  expect(text(p.render())).not.toContain("change it or try again");
  expect(p.button(p.render()).props.disabled).toBe(false);
});
