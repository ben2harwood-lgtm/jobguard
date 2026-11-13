import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell";
import { RecoveryCases } from "./recovery-cases";
const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async original => ({
 ...await original<typeof import("react")>(),
 useState: () => [state.values.shift(), vi.fn()],
 useRef: (current: unknown) => ({ current }),
 useCallback: (fn: unknown) => fn,
 useEffect: () => undefined,
}));
afterEach(() => vi.unstubAllGlobals());
const jobId = "11111111-1111-4111-8111-111111111112";
function recoveryPanels(node: React.ReactNode): React.ReactElement<{jobId:string}>[] {
 if (Array.isArray(node)) return node.flatMap(recoveryPanels);
 if (!React.isValidElement<{children?:React.ReactNode}>(node)) return [];
 if (node.type === RecoveryCases) return [node as React.ReactElement<{jobId:string}>];
 return recoveryPanels(node.props.children);
}
it("a loaded job without a capture proposal exposes the real recovery panel with its job identity", () => {
 vi.stubGlobal("React", React);
 state.values = [{ id: jobId, title: "Synthetic catch job", status: "invoiced", revision: 4 }, null, null, false, ""];
 const panels = recoveryPanels(WorkspaceShell({jobId}));
 expect(panels).toHaveLength(1);
 expect(panels[0]!.props.jobId).toBe(jobId);
});
it("a forbidden workspace does not expose recovery controls", () => {
 vi.stubGlobal("React", React);
 state.values = [null, null, "forbidden", false, ""];
 expect(recoveryPanels(WorkspaceShell({jobId}))).toEqual([]);
});
