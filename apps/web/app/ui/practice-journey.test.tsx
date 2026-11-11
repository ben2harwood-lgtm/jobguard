import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PracticeJourney } from "./practice-journey";

// Reuse the job-sources/job-parties hook harness to run the real read and render.
const facts = vi.hoisted(() => ({ generation: 0 }));
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
      return [slots[index]!.value, (value: unknown) => { slots[index]!.value = typeof value === "function" ? (value as (old: unknown) => unknown)(slots[index]!.value) : value; }];
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
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof React>(), useContext: () => facts.generation, ...hooks }));
afterEach(() => { facts.generation = 0; hooks.reset(); vi.unstubAllGlobals(); });

const jobId = "11111111-1111-4111-8111-111111111111";
const otherJobId = "22222222-2222-4222-8222-222222222222";
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function journey(status: string, variationStatus = 400, variationCode = "ACTIVATION_REQUIRED", invoiceJobId = jobId) {
  vi.stubGlobal("React", React);
  const fetch = vi.fn(async (path: string) => {
    if (path.endsWith("/proof")) return response({ version: "practice-proof-view.v1", environment: "synthetic_demo", jobId, completion: null, realExternalActions: 0 });
    if (path.endsWith("/variations")) return response({ code: variationCode }, variationStatus);
    if (path.endsWith("/customer-invoices")) return response({ version: 1, environment: "synthetic_demo", jobId: invoiceJobId, invoices: [] });
    if (path.endsWith("/fee-illustration")) return response({ code: "NOT_FOUND" }, 404);
    throw new Error(`Unexpected read ${path}`);
  });
  vi.stubGlobal("fetch", fetch);
  const render = () => { hooks.render(); const tree = PracticeJourney({ jobId, status }); hooks.effects(); return renderToStaticMarkup(tree); };
  expect(render()).toContain("Checking saved progress");
  await new Promise<void>(resolve => setImmediate(resolve));
  return { html: render(), fetch };
}

it.each(["draft", "quoting", "accepted", "lost"])("allows documented activation absence for a %s job", async status => {
  const { html, fetch } = await journey(status);
  expect(html).toContain("Continue this job");
  expect(html).not.toContain("could not be checked");
  expect(html).not.toContain("Checking saved progress");
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch).toHaveBeenCalledWith(`/api/jobs/${jobId}/variations`, expect.objectContaining({ cache: "no-store" }));
});

it.each([
  ["live", 400, "ACTIVATION_REQUIRED"],
  ["lost", 503, "ACTIVATION_REQUIRED"],
  ["lost", 400, "DATABASE_UNAVAILABLE"],
])("refuses unexpected variations absence for %s / %s / %s", async (status, code, body) => {
  const { html } = await journey(status, code, body);
  expect(html).toContain("Saved progress could not be checked");
  expect(html).not.toContain("journey-customer-balance");
});

it("refuses a wrong-job invoice projection instead of showing progress", async () => {
  const { html } = await journey("accepted", 400, "ACTIVATION_REQUIRED", otherJobId);
  expect(html).toContain("Saved progress could not be checked");
  expect(html).not.toContain("journey-customer-balance");
});

it("announces a requested recheck and hides the old balance", async () => {
  const { fetch } = await journey("accepted");
  const render = () => { hooks.render(); const tree = PracticeJourney({ jobId, status: "accepted" }); hooks.effects(); return tree; };
  const findButton = (node: React.ReactNode): React.ReactElement<{ onClick: () => void }> | undefined => {
    if (Array.isArray(node)) return node.map(findButton).find(Boolean);
    if (!React.isValidElement<{ children?: React.ReactNode; onClick: () => void }>(node)) return;
    return node.type === "button" ? node : findButton(node.props.children);
  };
  fetch.mockImplementation(() => new Promise(() => {}));
  findButton(render())!.props.onClick();
  const html = renderToStaticMarkup(render());
  expect(html).toContain("Checking saved progress");
  expect(html).not.toContain("journey-customer-balance");
});

it("keeps the saved progress visible during a silent generation refresh", async () => {
  const { fetch } = await journey("accepted");
  fetch.mockImplementation(() => new Promise(() => {}));
  const render = () => { hooks.render(); const tree = PracticeJourney({ jobId, status: "accepted" }); hooks.effects(); return renderToStaticMarkup(tree); };
  facts.generation++;
  render();
  expect(fetch).toHaveBeenCalledTimes(8);
  const html = render();
  expect(html).toContain("journey-customer-balance");
  expect(html).not.toContain("Checking saved progress");
});
