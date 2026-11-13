import { afterEach, expect, it, vi } from "vitest";
import * as React from "react";
import { JobFinalAccount } from "./job-final-account";

// Use the real source contract before workspace dist artifacts have been built.
vi.mock("@jobguard/api/final-account-contracts", () => import("../../../api/src/final-account.contracts.js"));
vi.mock("./final-account-lock", () => ({ FinalAccountLock: () => null }));
vi.mock("./customer-invoices", () => ({ CustomerInvoices: () => null }));

// Reuse the job-parties test's hook runtime to press real handlers before a rerender.
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


const jobId = "11111111-1111-4111-8111-111111111111";
const view = { version: 1, environment: "synthetic_demo", jobId, account: null };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
type Node = React.ReactElement<Record<string, unknown>>;
function findButton(node: React.ReactNode): Node | undefined {
  if (Array.isArray(node)) return node.map(findButton).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  return node.type === "button" && node.props.children === "Build final account"
    ? node : findButton(node.props.children as React.ReactNode);
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (React.isValidElement<Record<string, unknown>>(node)) return text(node.props.children as React.ReactNode);
  return typeof node === "string" ? node : "";
}
async function setup() {
  vi.stubGlobal("React", React);
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => view });
  vi.stubGlobal("fetch", fetch);
  const render = () => { hooks.render(); const tree = JobFinalAccount({ jobId }); hooks.effects(); return tree; };
  render();
  await tick();
  return { fetch, render, button: findButton(render())! };
}

it("ignores same-turn repeat clicks and clears busy after a successful response", async () => {
  const { fetch, render, button } = await setup();
  let resolve!: (response: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const click = button.props.onClick as () => void;
  click(); click();
  expect(fetch).toHaveBeenCalledTimes(2); // initial GET, one POST
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toMatchObject({ expectedRevision: 0 });
  expect(findButton(render())!.props).toMatchObject({ disabled: true, "aria-busy": true });
  resolve({ ok: true, json: async () => view });
  await tick();
  expect(findButton(render())!.props).toMatchObject({ disabled: false, "aria-busy": false });
  expect(text(render())).toContain("Final account rebuilt from accepted history and approved changes.");
});

it.each([
  ["STALE_FINAL_ACCOUNT_REVISION", "A final account build is already in progress or has completed."],
  ["STALE_APPROVED_SOURCES", "The approved sources changed."],
])("distinguishes %s and releases the guard", async (code, notice) => {
  const { fetch, render, button } = await setup();
  fetch.mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({ code }) });
  (button.props.onClick as () => void)();
  await tick();
  const tree = render();
  expect(text(tree)).toContain(notice);
  if (code === "STALE_FINAL_ACCOUNT_REVISION") expect(text(tree)).not.toContain("The approved sources changed.");
  expect(findButton(tree)!.props).toMatchObject({ disabled: false, "aria-busy": false });
  (findButton(tree)!.props.onClick as () => void)();
  await tick();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(text(render())).toContain("Final account rebuilt");
});

it.each(["network", "http", "invalid-json"])("releases the guard after %s failure", async failure => {
  const { fetch, render, button } = await setup();
  if (failure === "network") fetch.mockRejectedValueOnce(new Error("offline"));
  else if (failure === "http") fetch.mockResolvedValueOnce({ ok: false, status: 500 });
  else fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ invalid: true }) });
  (button.props.onClick as () => void)();
  await tick();
  const tree = render();
  expect(text(tree)).toContain("The final account could not be built.");
  expect(findButton(tree)!.props).toMatchObject({ disabled: false, "aria-busy": false });
  (findButton(tree)!.props.onClick as () => void)();
  await tick();
  expect(fetch).toHaveBeenCalledTimes(3);
});
