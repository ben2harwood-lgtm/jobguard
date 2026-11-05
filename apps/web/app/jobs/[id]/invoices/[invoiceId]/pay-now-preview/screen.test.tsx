import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { payNowOptions } from "@jobguard/core";
import { PayNowAttemptScreen, StoredPayNowOptions } from "./screen";
const id = "11111111-1111-4111-8111-111111111111";
const invoice = { version: "pay-now.synthetic-invoice.v1", environment: "synthetic_demo", tenantId: id, jobId: id, invoiceId: id,
  revision: 1, balancePence: 10000, currency: "GBP", kind: "final", includesCatch: false, builderAccount: `fake-builder-${id}` };
it("renders identical wording, options and builder fees for server projections with or without a catch", () => {
  const render = (includesCatch: boolean) => renderToStaticMarkup(<StoredPayNowOptions view={{ version: "pay-now-preview.v1", synthetic: true, balancePence: 10000,
    options: payNowOptions({ ...invoice, includesCatch }), attempts: [] }} simulate={() => {}} />);
  const screen = render(false); expect(render(true)).toBe(screen);
  for (const text of ["Bank transfer", "Card", "Pay by bank", "No customer surcharge", "Builder fee preview", "min-height:44px"]) expect(screen).toContain(text);
  expect(screen.match(/<button /gu)).toHaveLength(3);
});

// Exercise the screen's command handler and state transitions without a browser.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = initial;
    return [hooks.cells[index], (value: unknown) => { hooks.cells[index] = value; }];
  },
  useRef: (current: unknown) => ({ current }), useEffect: () => undefined,
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); hooks.cells = []; hooks.cursor = 0; });
it.each([400, 401, 403, 404, 409, 422, 408, 429, 500, 503, "network"] as const)(
  "clears only definite refusals and retains the exact command for uncertain outcome %s", async status => {
    const command = { commandId: id, rail: "card" };
    const stored = new Map([[`pay-now-preview:${id}:${id}`, JSON.stringify(command)]]);
    vi.stubGlobal("sessionStorage", {
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      memberships: [{ tenantId: id }], csrfToken: "fictional-csrf",
    })));
    if (status === "network") fetch.mockRejectedValueOnce(new TypeError("Lost response"));
    else fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: "ALREADY_ATTEMPTED" }), { status }));
    hooks.cells = [null, "", false, command];
    const screen = PayNowAttemptScreen({ jobId: id, invoiceId: id });
    const retry = React.Children.toArray(screen.props.children).find(child =>
      React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children === "Retry same practice attempt"
    ) as React.ReactElement<{ onClick: () => void }>;
    retry.props.onClick();
    await vi.waitFor(() => expect(hooks.cells[2]).toBe(false));
    expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual(command);
    const definite = typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
    expect(hooks.cells[3]).toEqual(definite ? null : command);
    expect(stored.has(`pay-now-preview:${id}:${id}`)).toBe(!definite);
    if (definite) expect(hooks.cells[1]).toBe(`Practice attempt refused (${status}). Reload the stored invoice.`);
    hooks.cursor = 0;
    const html = renderToStaticMarkup(PayNowAttemptScreen({ jobId: id, invoiceId: id }));
    expect(html.includes("Retry same practice attempt")).toBe(!definite);
    if (definite) expect(html).toContain(`Practice attempt refused (${status})`);
  });
