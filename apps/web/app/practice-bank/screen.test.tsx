import * as React from "react";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PracticeBankScreen } from "./screen";
vi.stubGlobal("React", React);
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
