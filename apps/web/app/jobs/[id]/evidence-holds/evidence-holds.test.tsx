import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { EvidenceHolds } from "./evidence-holds";

// Drive the real command handler using the existing screen-test hook pattern.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [hooks.cells[index], (value: unknown) => { hooks.cells[index] = value; }];
  },
  useRef: (current: unknown) => ({ current }), useEffect: () => undefined, useCallback: (fn: unknown) => fn,
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); hooks.cells = []; hooks.cursor = 0; });
it.each([403, 503, "network"] as const)("handles hold request outcome %s without changing retry identity", async status => {
  vi.stubGlobal("React", React);
  const request = { version: "evidence-hold.v1", commandId: "fictional-command", idempotencyKey: "fictional-key",
    evidenceId: "fictional-evidence", action: "apply_hold" };
  const key = "evidence-hold.v1:fictional-job";
  const stored = new Map([[key, JSON.stringify(request)]]);
  vi.stubGlobal("sessionStorage", { setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
  const fetch = vi.spyOn(globalThis, "fetch");
  if (status === "network") fetch.mockRejectedValueOnce(new TypeError("Lost response"));
  else fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: status === 403 ? "Request refused. An active owner is required." : "Server unavailable." }), { status }));
  fetch.mockResolvedValue(new Response(JSON.stringify({ items: [] })));
  hooks.cells = [[], "", "", false, request];
  const screen = EvidenceHolds({ jobId: "fictional-job" });
  const buttons = React.Children.toArray(screen.props.children).filter(child => React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === "div");
  const retry = React.Children.toArray((buttons[0] as React.ReactElement<{ children: React.ReactNode }>).props.children).find(child =>
    React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children === "Retry same request"
  ) as React.ReactElement<{ onClick: () => void }>;
  retry.props.onClick();
  await vi.waitFor(() => expect(hooks.cells[3]).toBe(false));
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual(request);
  expect(hooks.cells[4]).toEqual(request);
  expect(stored.get(key)).toBe(JSON.stringify(request));
  hooks.cursor = 0;
  const html = renderToStaticMarkup(EvidenceHolds({ jobId: "fictional-job" }));
  expect(html).toContain("Retry same request");
  if (status === 403) expect(html).toContain("Request refused. An active owner is required.");
  hooks.cursor = 0;
  const next = EvidenceHolds({ jobId: "fictional-job" });
  const group = React.Children.toArray(next.props.children).find(child => React.isValidElement(child) && child.type === "div") as React.ReactElement<{ children: React.ReactNode }>;
  const again = React.Children.toArray(group.props.children)[0] as React.ReactElement<{ onClick: () => void }>;
  again.props.onClick();
  await vi.waitFor(() => expect(hooks.cells[3]).toBe(false));
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => init!.body)).toEqual([JSON.stringify(request), JSON.stringify(request)]);
});
