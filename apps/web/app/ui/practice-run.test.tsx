import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sandboxRunResponseV1 } from "@jobguard/api/sandbox-contracts";
import { PracticeRun } from "./practice-run";

// Reuse the job-sources/job-parties hook harness to run the real read and render.
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
afterEach(() => { hooks.reset(); vi.unstubAllGlobals(); });

beforeEach(() => vi.stubGlobal("React", React));
const runId = "11111111-1111-4111-8111-111111111111";
const validResponse = sandboxRunResponseV1.parse({
  version: 1, environment: "synthetic_demo",
  run: {
    id: runId, jobId: "22222222-2222-4222-8222-222222222222",
    scenario: "core-1000", status: "Synthetic practice", step: 0, stepCount: 3,
    fakeClockTick: 0, realExternalActions: 0, headline: "Fictional quote ready",
  },
});
const loadError = "This practice run could not load";
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function render() {
  hooks.render();
  const tree = PracticeRun({ runId });
  hooks.effects();
  return tree;
}
type Element = React.ReactElement<Record<string, unknown>>;
function elements(tree: React.ReactNode): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...elements(tree.props.children as React.ReactNode)];
}
function retry(tree: React.ReactNode) {
  const button = elements(tree).find(node => node.type === "button" && node.props.children === "Try again");
  expect(button).toBeDefined();
  (button!.props.onClick as () => void)();
}
async function failedLoad() {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  expect(renderToStaticMarkup(render())).toContain("Loading your private practice run");
  await settle();
  expect(renderToStaticMarkup(render())).toContain(loadError);
  return fetch;
}
function pendingRetry(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
  let finish!: (response: Response) => void;
  fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  retry(render());
  const pending = render();
  expect(renderToStaticMarkup(pending)).toContain("Loading your private practice run");
  // The retry control is removed while loading, so it cannot be clicked again.
  expect(elements(pending).filter(node => node.type === "button")).toHaveLength(0);
  render();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenNthCalledWith(2, `/api/sandbox/runs/${runId}`, { cache: "no-store" });
  return finish;
}

it("clears the obsolete load error only after a schema-valid retry succeeds", async () => {
  const fetch = await failedLoad();
  const finish = pendingRetry(fetch);
  finish(Response.json(validResponse));
  await settle();
  const html = renderToStaticMarkup(render());
  expect(html).toContain("Your fresh practice run");
  expect(html).toContain(validResponse.run.headline);
  expect(html).toContain('class="practice-card"');
  expect(html).not.toContain(loadError);
  expect(html).not.toContain('role="alert"');
  expect(html).not.toContain("Try again");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps a usable error and retry when the second GET also fails", async () => {
  const fetch = await failedLoad();
  const finish = pendingRetry(fetch);
  finish(new Response(null, { status: 503 }));
  await settle();
  const tree = render();
  const html = renderToStaticMarkup(tree);
  expect(html).toContain(loadError);
  expect(html).toContain("Try again");
  expect(html).not.toContain('class="practice-card"');
  fetch.mockResolvedValueOnce(Response.json(validResponse));
  retry(tree);
  await settle();
  expect(renderToStaticMarkup(render())).toContain(validResponse.run.headline);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it.each(["invalid schema", "invalid JSON"])("rejects a successful HTTP retry with %s", async kind => {
  const fetch = await failedLoad();
  const finish = pendingRetry(fetch);
  finish(kind === "invalid schema"
    ? Response.json({ ...validResponse, run: { ...validResponse.run, realExternalActions: 1 } })
    : new Response("not JSON", { status: 200 }));
  await settle();
  const html = renderToStaticMarkup(render());
  expect(html).toContain("Try again");
  expect(html).toContain('<h1 tabindex="-1">');
  expect(html).not.toContain('class="practice-card"');
  expect(html).not.toContain(validResponse.run.headline);
});
