import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { EvidenceHolds } from "./evidence-holds";
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [hooks.cells[index], (value: unknown) => { hooks.cells[index] = value; }];
  },
  useRef: (current: unknown) => ({ current }), useEffect: () => undefined,
  useCallback: (fn: unknown) => fn,
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); hooks.cells = []; hooks.cursor = 0; });
it.each([403, 503, "network"] as const)("clears only definite refusal and preserves exact retry for %s", async status => {
  vi.stubGlobal("React", React);
  const request = { version: "evidence-hold.v1", commandId: "fictional-command", idempotencyKey: "fictional-key", evidenceId: "fictional-evidence", action: "apply_hold" };
  const key = "evidence-hold.v1:fictional-job";
  const stored = new Map([[key, JSON.stringify(request)]]);
  vi.stubGlobal("sessionStorage", { setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
  const fetcher = vi.spyOn(globalThis, "fetch");
  if (status === "network") fetcher.mockRejectedValueOnce(new TypeError("Connection lost"));
  else fetcher.mockResolvedValueOnce(Response.json({ message: status === 403 ? "Request refused." : "Retry the same request." }, { status }));
  fetcher.mockImplementation(async () => Response.json({ items: [] }));
  hooks.cells = [[], "", "", false, request];
  const clickRetry = async () => {
    hooks.cursor = 0;
    const screen = EvidenceHolds({ jobId: "fictional-job" });
    const buttons = React.Children.toArray(screen.props.children).find(child => React.isValidElement(child) && child.type === "div") as React.ReactElement<{ children: React.ReactNode }>;
    const button = React.Children.toArray(buttons.props.children).find(child => React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children === "Retry same request") as React.ReactElement<{ onClick: () => void }>;
    button.props.onClick();
    await vi.waitFor(() => expect(hooks.cells[3]).toBe(false));
  };
  await clickRetry();
  expect(hooks.cells[4]).toEqual(status === 403 ? null : request);
  expect(stored.has(key)).toBe(status !== 403);
  hooks.cursor = 0;
  const html = renderToStaticMarkup(EvidenceHolds({ jobId: "fictional-job" }));
  expect(html.includes("Retry same request")).toBe(status !== 403);
  if (status === 403) expect(html).toContain("Request refused.");
  else {
    await clickRetry();
    const posts = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts.map(([, init]) => JSON.parse(init!.body as string))).toEqual([request, request]);
  }
});
