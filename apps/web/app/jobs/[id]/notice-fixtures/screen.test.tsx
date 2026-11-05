import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NoticeFixtureScreen } from "./screen";
vi.stubGlobal("React", React);
afterEach(() => vi.restoreAllMocks());
it("starts with the structured checklist, practice disclosure and no client legal preview", () => {
  const html = renderToStaticMarkup(<NoticeFixtureScreen jobId="00000000-0000-4000-8000-000000000001" realNoticeRefusal="Server refuses real notice generation and sending" />);
  for (const text of ["reviewed by nobody", "Nothing is generated, sent or served", "Structured input checklist", "Due date", "Fictional contract reference", "Trigger evidence UUID", "Recipient reference", "Service method", "Server refuses real notice generation and sending", "Generate notice", "Send notice"]) expect(html).toContain(text);
  expect(html).toContain("min-height:44px");
  expect(html).not.toContain('data-testid="notice-preview"');
});
