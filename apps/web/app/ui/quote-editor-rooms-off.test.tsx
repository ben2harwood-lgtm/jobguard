import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { QuoteEditor } from "./quote-editor";

// V2-SQ-E: off local V2 the saved quote drops sections, so the editor must not offer the "Show as" switch.
const hooks = vi.hoisted(() => ({ at: new Map<number, unknown>(), cursor: 0 }));
vi.mock("react", async original => ({
 ...await original<typeof React>(),
 useState: (initial: unknown) => { const i = hooks.cursor++; return [hooks.at.has(i) ? hooks.at.get(i) : typeof initial === "function" ? initial() : initial, vi.fn()]; },
 useRef: (current: unknown) => ({ current }),
 useCallback: (fn: unknown) => fn,
 useMemo: (fn: () => unknown) => fn(),
 useEffect: () => undefined,
}));
afterEach(() => { hooks.at.clear(); hooks.cursor = 0; vi.unstubAllGlobals(); });
const jobId = "11111111-1111-4111-8111-111111111112";
const source = [{ id: "line", scopeItemId: "11111111-1111-4111-8111-111111111113", description: "Fictional bathroom tiling", quantity: "1", unit: "item", rate: 10000, origin: "human" as const, status: "accepted" as const, reason: "", category: "", room: "Bathroom" }];
const ROOM_LAYOUT = 25; // the 26th useState: the workspace's roomLayout flag
function html(roomLayout: boolean) {
 vi.stubGlobal("React", React);
 hooks.cursor = 0; hooks.at.set(ROOM_LAYOUT, roomLayout);
 return renderToStaticMarkup(<QuoteEditor jobId={jobId} source={source as never} questions={[]} back={() => undefined}/>);
}
it("shows no room switch or room sections when the workspace has no room layout", () => {
 const off = html(false);
 expect(off).toContain("Fictional bathroom tiling");
 expect(off).not.toContain("Show as");
 expect(off).not.toContain("quote-editor-room");
});
it("shows the room switch on local V2", () => {
 const on = html(true);
 expect(on).toContain('aria-label="Show Bathroom as"');
 expect(on).toContain('aria-label="Price Bathroom"');
});
