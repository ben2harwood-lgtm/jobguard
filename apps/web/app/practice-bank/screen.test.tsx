import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PracticeBankScreen } from "./screen";
const hooks = vi.hoisted(() => ({ view: null as unknown }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => [initial === null ? hooks.view : initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.stubGlobal("React", React);
afterEach(() => { hooks.view = null; });
it("labels the screen as fictional and disclaims landing and fees", () => {
  const html = renderToStaticMarkup(<PracticeBankScreen />);
  expect(html).toContain("Fictional account only. No real bank is connected.");
  expect(html).toContain("A bank line does not mark a case landed and does not start a fee.");
});
it("keeps DB imports, provider credentials and consent secrets out of the client", () => {
  const source = readFileSync("app/practice-bank/screen.tsx", "utf8");
  expect(source).not.toMatch(/@jobguard\/db|fake_token_|stateHash|client_secret|\.state\b|\.code\s*:/u);
  for (const status of ["pending", "settled", "reversed"]) expect(source).toContain(`"${status}"`);
  expect(source).toContain("m.status === status");
});

it("keeps linked movements visible, shows Connect again and disables pull when credentials are unavailable here", () => {
  hooks.view = { version: "ais-practice-view.v1", connection: { connectionId: "fictional", status: "linked" },
    credentialsUnavailable: true, movements: [{ movementRef: "fake_cash", status: "settled", pence: 32000, currency: "GBP", bookedOn: "2026-10-02" }] };
  const html = renderToStaticMarkup(<PracticeBankScreen />);
  expect(html).toContain("Practice credentials lost or revoked. Connect again for fresh consent.");
  expect(html).toContain("fake_cash");
  expect(html).toMatch(/<button disabled="">Pull fictional movements<\/button>/u);
  expect(html).not.toContain("Fictional account linked for practice");
});
it.each([false, undefined])("keeps pull available for a linked account with credentialsUnavailable=%s", credentialsUnavailable => {
  hooks.view = { version: "ais-practice-view.v1", connection: { connectionId: "fictional", status: "linked" }, credentialsUnavailable, movements: [] };
  const html = renderToStaticMarkup(<PracticeBankScreen />);
  expect(html).toContain("Fictional account linked for practice");
  expect(html).toContain("<button>Pull fictional movements</button>");
});
