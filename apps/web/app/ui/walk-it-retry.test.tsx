import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WalkIt } from "./jobguard-app";
import { cancelLocalSpeech, createLocalSpeechAdapter } from "./local-speech";
import { dictationMessage, LocalDictation, speechFailure, type LocalAvailability, type LocalSpeechAdapter } from "./local-dictation";

// Exercise the real component's handlers using the established review-proposal harness.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const frames = new Map<string, any[]>();
  let slots: any[] = [];
  const cleanups: (() => void)[] = [];
  return {
    reset() { cursor = 0; frames.clear(); slots = []; },
    render(component = "walk") { cursor = 0; if (!frames.has(component)) frames.set(component, []); slots = frames.get(component)!; },
    cleanup() { for (const cleanup of cleanups.splice(0)) cleanup(); },
    useState(initial: any) {
      const index = cursor++;
      const frame = slots;
      if (!(index in frame)) frame[index] = typeof initial === "function" ? initial() : initial;
      return [frame[index], (value: any) => { frame[index] = typeof value === "function" ? value(frame[index]) : value; }];
    },
    useRef(initial: unknown) { return slots[cursor++] ??= { current: initial }; },
    useEffect(effect: () => void | (() => void), dependencies: unknown[]) {
      const index = cursor++, previous = slots[index] as unknown[] | undefined;
      if (previous && previous.length === dependencies.length && previous.every((value, i) => Object.is(value, dependencies[i]))) return;
      slots[index] = dependencies;
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    },
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
afterEach(() => { hooks.cleanup(); vi.unstubAllGlobals(); });

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

it.each(["Stop listening", "Cancel dictation"])("keeps %s usable during a pending capture without applying different source", async control => {
  const server = captureServer(), p = panel();
  const persist = server.fetcher.getMockImplementation()!;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  server.fetcher.mockImplementationOnce(async (...args) => { await pending; return persist(...args); });
  let callbacks!: Parameters<LocalSpeechAdapter["start"]>[0];
  const stop = vi.fn(() => callbacks.end()), cancel = vi.fn();
  const adapter: LocalSpeechAdapter = {
    configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
    available: async () => "installed", install: async () => true,
    start: vi.fn(next => { callbacks = next; return { stop, cancel }; }),
  };
  vi.stubGlobal("window", { __JOBGUARD_SPEECH_ADAPTER__: adapter });
  const dictation = () => {
    const node = all(p.render(), element => element.type === LocalDictation)[0]!;
    hooks.render("dictation");
    return LocalDictation(node.props as React.ComponentProps<typeof LocalDictation>);
  };
  const speechButton = (label: string) => all(dictation(), node => node.type === "button" && text(node.props.children) === label)[0]!;
  dictation(); await flush();
  speechButton("Talk through a quote").props.onClick(); await flush();
  callbacks.final(editedSource, "fictional-speech-1");
  expect(adapter.start).toHaveBeenCalledTimes(1);
  p.button(p.render()).props.onClick();
  expect(server.fetcher).toHaveBeenCalledTimes(1);
  expect(p.source(p.render()).props.disabled).toBe(true);
  // Native fieldset disabling overrides each child's own disabled prop.
  const blockingAncestors = all(p.render(), node => node.type === "fieldset" && node.props.disabled && all(node.props.children, child => child.type === LocalDictation).length > 0);
  expect(blockingAncestors).toHaveLength(0);
  expect(speechButton("Use these words").props.disabled).toBe(true);
  speechButton("Use these words").props.onClick();
  expect(cancel).not.toHaveBeenCalled();
  expect(p.source(p.render()).props.value).toBe(firstSource);
  expect(speechButton(control).props.disabled).not.toBe(true);
  speechButton(control).props.onClick();
  expect(control === "Stop listening" ? stop : cancel).toHaveBeenCalledTimes(1);
  expect(speechButton("Talk through a quote").props.disabled).toBe(true);
  speechButton("Talk through a quote").props.onClick();
  expect(adapter.start).toHaveBeenCalledTimes(1);
  release(); await flush();
  expect(server.saved.size).toBe(1);
  expect(server.requests[0]!.source).toMatchObject({ kind: "text", text: firstSource });
  expect(speechButton("Talk through a quote").props.disabled).toBe(false);
  if (control === "Stop listening") {
    expect(speechButton("Use these words").props.disabled).toBe(false);
    speechButton("Use these words").props.onClick();
    expect(p.source(p.render()).props.value).toBe(editedSource);
    await p.submit();
    expect(server.requests[1]!.captureId).not.toBe(server.requests[0]!.captureId);
    expect(server.requests[1]!.source).toMatchObject({ kind: "browser_local_transcript", text: editedSource });
  }
});

it("does not install a speech model while a capture is pending", async () => {
  captureServer();
  const install = vi.fn(async () => true);
  const adapter: LocalSpeechAdapter = {
    configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
    available: async () => "downloadable", install,
    start: vi.fn(() => ({ stop: vi.fn(), cancel: vi.fn() })),
  };
  vi.stubGlobal("window", { __JOBGUARD_SPEECH_ADAPTER__: adapter });
  const p = panel();
  let release!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
  const dictation = () => {
    const node = all(p.render(), element => element.type === LocalDictation)[0]!;
    hooks.render("dictation");
    return LocalDictation(node.props as React.ComponentProps<typeof LocalDictation>);
  };
  dictation(); await flush();
  p.button(p.render()).props.onClick();
  const button = all(dictation(), node => node.type === "button" && text(node.props.children) === "Talk through a quote")[0]!;
  expect(button.props.disabled).toBe(true);
  button.props.onClick(); await flush();
  expect(install).not.toHaveBeenCalled();
  release(new Response(JSON.stringify({ code: "DATABASE_UNAVAILABLE" }), { status: 503 })); await flush();
  const enabled = all(dictation(), node => node.type === "button" && text(node.props.children) === "Talk through a quote")[0]!;
  expect(enabled.props.disabled).toBe(false);
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

// V2-SQ1: "Talk through a quote" asks for the microphone, loads the model and listens in one press.
function soloDictation(adapter: LocalSpeechAdapter | null, props: Partial<React.ComponentProps<typeof LocalDictation>> = {}) {
  if (adapter) vi.stubGlobal("window", { __JOBGUARD_SPEECH_ADAPTER__: adapter });
  const render = () => { hooks.render("solo"); return LocalDictation({ onUse: () => {}, ...props }); };
  const button = (label = props.startLabel ?? "Talk through a quote") => all(render(), node => node.type === "button" && text(node.props.children) === label)[0];
  return { render, button };
}
function fakeAdapter(availability: LocalAvailability, install: LocalSpeechAdapter["install"] = async () => true) {
  return {
    configuration: { language: "en-GB", processLocally: true, remoteFallback: false },
    available: async () => availability, install: vi.fn(install),
    start: vi.fn(() => ({ stop: vi.fn(), cancel: vi.fn() })),
  } satisfies LocalSpeechAdapter;
}

it("gives each microphone failure its own message, and says how to allow a refused one", () => {
  expect(dictationMessage("denied")).toBe("JobGuard can't use your microphone. To allow it, open this site's settings from the address bar, allow Microphone, then press Talk through a quote again. You can type the job below instead.");
  expect(dictationMessage("no_microphone")).toBe("No microphone found. You can type the job below instead.");
  expect(dictationMessage("no_speech")).toBe("We didn't hear anything. Press Talk through a quote to try again, or type below.");
  expect(dictationMessage("unsupported")).toBe("Voice doesn't work in this browser. Type the job below. It works the same way.");
  expect(dictationMessage("failed")).toBe("The microphone stopped. Your words so far are kept. You can try again or type.");
  for (const [name, code] of [["NotAllowedError", "denied"], ["SecurityError", "denied"], ["NotFoundError", "no_microphone"],
    ["OverconstrainedError", "no_microphone"], ["AbortError", "failed"]] as const) expect(speechFailure(new DOMException("x", name))).toBe(code);
  expect(speechFailure(new Error("worker"))).toBe("failed");
});

it.each(["downloadable", "installed"] as const)("one press starts listening when the voice model is %s", async availability => {
  const adapter = fakeAdapter(availability), solo = soloDictation(adapter);
  solo.render(); await flush();
  expect(solo.button()!.props.disabled).toBe(false);
  solo.button()!.props.onClick(); await flush();
  expect(adapter.install).toHaveBeenCalledTimes(availability === "downloadable" ? 1 : 0);
  expect(adapter.start).toHaveBeenCalledTimes(1);
  expect(text(solo.render())).toContain("Listening on this device");
  expect(solo.button()!.props.disabled).toBe(true);
  expect(all(solo.render(), node => node.type === "button" && text(node.props.children) === "Install on-device voice")).toEqual([]);
});

it("is disabled while a draft is saving, and an unsupported browser says to type instead", async () => {
  const pending = soloDictation(fakeAdapter("downloadable"), { applyDisabled: true });
  pending.render(); await flush();
  expect(pending.button()!.props.disabled).toBe(true);
  hooks.reset();
  const unsupported = soloDictation(fakeAdapter("unavailable"));
  unsupported.render(); await flush();
  expect(unsupported.button()!.props.disabled).toBe(true);
  expect(text(unsupported.render())).toContain(dictationMessage("unsupported"));
});

it.each([["NotAllowedError", "denied"], ["NotFoundError", "no_microphone"]] as const)("a microphone %s gives the %s message and can be pressed again", async (name, code) => {
  const adapter = fakeAdapter("downloadable", async () => { throw new DOMException("refused", name); }), solo = soloDictation(adapter);
  solo.render(); await flush();
  solo.button()!.props.onClick(); await flush();
  expect(adapter.start).not.toHaveBeenCalled();
  expect(text(solo.render())).toContain(dictationMessage(code));
  expect(solo.button()!.props.disabled).toBe(false);
  solo.button()!.props.onClick(); await flush();
  expect(adapter.install).toHaveBeenCalledTimes(2);
});

it("keeps the extra-work screen's own button label and uses it in its messages", async () => {
  const solo = soloDictation(fakeAdapter("downloadable", async () => { throw new DOMException("refused", "NotAllowedError"); }), { startLabel: "Talk through the example" });
  solo.render(); await flush();
  expect(solo.button("Talk through a quote")).toBeUndefined();
  solo.button()!.props.onClick(); await flush();
  expect(text(solo.render())).toContain("then press Talk through the example again");
});

// Codex review on #1002: Cancel while the voice model loads must settle the install, or every later press is ignored.
it("cancelling while the on-device model loads settles the install so it can be tried again", async () => {
  const track = { stop: vi.fn() };
  class SilentWorker { onmessage: unknown; onerror: unknown; onmessageerror: unknown; postMessage() {} terminate = vi.fn(); }
  class Context { sampleRate = 16000; resume() { return Promise.resolve(); } close() { return Promise.resolve(); } }
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  vi.stubGlobal("window", { AudioContext: Context });
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("Worker", SilentWorker);
  try {
    const adapter = createLocalSpeechAdapter(() => {})!;
    const install = adapter.install();
    await new Promise(resolve => setTimeout(resolve, 0)); // the microphone is granted and the model is loading
    cancelLocalSpeech(adapter);
    await expect(install).rejects.toThrow("Local speech cancelled");
    expect(track.stop).toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
