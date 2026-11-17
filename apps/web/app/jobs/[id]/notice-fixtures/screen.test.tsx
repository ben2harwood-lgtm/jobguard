import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NoticeFixtureScreen } from "./screen";
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useEffect: vi.fn(actual.useEffect) };
});
vi.stubGlobal("React", React);
afterEach(() => vi.restoreAllMocks());
it("starts with the structured checklist, practice disclosure and no client legal preview", () => {
  const html = renderToStaticMarkup(<NoticeFixtureScreen jobId="00000000-0000-4000-8000-000000000001" realNoticeRefusal="Server refuses real notice generation and sending" />);
  for (const text of ["reviewed by nobody", "Nothing is generated, sent or served", "Structured input checklist", "Due date", "Fictional contract reference", "Trigger evidence UUID", "Recipient reference", "Service method", "Server refuses real notice generation and sending", "Generate notice", "Send notice"]) expect(html).toContain(text);
  expect(html).toContain("min-height:44px");
  expect(html).not.toContain('data-testid="notice-preview"');
});

it("reports a load outage as unknown rather than an absent notice", async () => {
  const setters = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  let index = 0, effect: (() => void) | undefined;
  vi.mocked(React.useState).mockImplementation(((initial: unknown) => [initial, setters[index++]!]) as unknown as typeof React.useState);
  vi.mocked(React.useEffect).mockImplementation(callback => { effect = callback as () => void; });
  vi.stubGlobal("sessionStorage", { getItem: () => null });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/auth/session"
    ? { ok: true, json: async () => ({ csrfToken: "fictional", memberships: [{ tenantId: "fictional" }] }) }
    : { ok: false, status: 503 }));
  try {
    renderToStaticMarkup(<NoticeFixtureScreen jobId="00000000-0000-4000-8000-000000000001" realNoticeRefusal="Disabled" />);
    effect!();
    await vi.waitFor(() => expect(setters[2]).toHaveBeenCalledWith("Practice notice records could not be loaded. The result is unknown. Refresh and try again."));
    expect(setters[2]).not.toHaveBeenCalledWith(expect.stringContaining("first complete revision"));
  } finally {
    vi.unstubAllGlobals();
    vi.stubGlobal("React", React);
  }
});
