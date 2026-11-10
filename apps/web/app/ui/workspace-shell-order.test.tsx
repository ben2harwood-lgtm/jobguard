import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./workspace-shell";
import type { CaptureWorkspaceResponse } from "@jobguard/api/capture-contracts";

const state = vi.hoisted(() => ({ values: [] as unknown[], effects: [] as (() => unknown)[], live: false, editor: null as React.ReactNode }));
vi.mock("react", async original => ({
 ...await original<typeof React>(),
 useState: (initial: unknown) => [state.values.length ? state.values.shift() : typeof initial === "function" ? initial() : initial, vi.fn()],
 useRef: (current: unknown) => ({ current }),
 useCallback: (fn: unknown) => fn,
 useEffect: (effect: () => unknown) => { state.effects.push(effect); },
}));
// Model the persisted reads that QuoteEditor and JobFinalAccount load in the browser.
vi.mock("./quote-editor", async original => {
 const { QuoteEditor } = await original<typeof import("./quote-editor")>();
 return { QuoteEditor: (props: React.ComponentProps<typeof QuoteEditor>) => {
  if (state.live) state.values = [true, null, false, false, true, jobId, 1, "", [], [], [], "practice@example.invalid", null, "simulated_delivery", false,
   { documentVersion: 1, netPence: 100000, totalPence: 120000, acceptedAt: "2026-11-09", actor: "Builder", method: "email", sourceEvidence: "Fictional" },
   null, "Fictional customer", "email", "2026-11-09", [], { acceptedNetPence: 100000, acceptedDocumentVersion: 1, baseCreditPence: 0 }, false, null, "no_charge"];
  state.editor = QuoteEditor(props);
  return state.editor;
 } };
});
vi.mock("./job-final-account", async original => {
 const { JobFinalAccount } = await original<typeof import("./job-final-account")>();
 return { JobFinalAccount: (props: React.ComponentProps<typeof JobFinalAccount>) => {
  if (state.live) state.values = [{ account: { id: jobId, revision: 1, sourceHash: "a".repeat(64), lines: [], pending: [], proof: [], issueBlocked: false, totals: { net: { pence: 100000 }, tax: { pence: 20000 }, total: { pence: 120000 } } } }, false, false, "", false];
  return JobFinalAccount(props);
 } };
});
afterEach(() => vi.unstubAllGlobals());
const jobId = "11111111-1111-4111-8111-111111111112";
function workspace(status: CaptureWorkspaceResponse["status"], fragment = "") {
 vi.stubGlobal("React", React);
 const capture: CaptureWorkspaceResponse = {
  version: 1, environment: "synthetic_demo", captureId: jobId, jobId, proposalId: jobId, reviewId: jobId,
  status, source: { text: "Fictional room", version: 1, kind: "text", acquisition: null, audioByteLength: 0 },
  proposal: { title: "Fictional decorating job", lines: [], questions: [] }, review: null,
 };
 state.live = status === "live";
 state.effects = [];
 state.values = [null, capture, null, false, fragment];
 return WorkspaceShell({ jobId });
}
function ids(html: string, attribute: string) {
 return [...new Set([...html.matchAll(new RegExp(`(?:^|\\s)${attribute}="([^"]+)"`, "gu"))].map(match => match[1]))].sort();
}
it("puts the job title, continue card and customer/site before scope and practice tools", () => {
 const html = renderToStaticMarkup(workspace("draft"));
 const positions = ["Fictional decorating job", 'data-testid="uiwire15-journey"', "Customer and site", "Check the work items", "Practice tools — demo only, not part of your job", "Materials"].map(text => html.indexOf(text));
 expect(positions.every(position => position >= 0)).toBe(true);
 expect(positions).toEqual([...positions].sort((a,b) => a-b));
});
it("keeps the data-testid set rendered by the live job before reordering", () => {
 const html = renderToStaticMarkup(workspace("live", "#quote"));
 // Captured from unmodified HEAD with this same loaded live-job fixture.
 expect(ids(html, "data-testid")).toEqual(["accepted-net", "accepted-revision", "activation-policy", "base-credit", "confirmed-bill-reduction", "customer-messages", "final-account-lock", "final-baseline", "final-check-reveal", "final-gross", "final-net", "final-source-hash", "final-variation-net", "final-vat", "job-diary", "job-status", "job-work-state", "mandatory-decision-count", "prevention-panel", "proof-state", "quote-delivery", "quote-gross", "quote-net", "quote-revision", "quote-vat", "real-external-actions", "recovery-allocation-workbench", "stage-status", "supplier-debt-recognized", "supplier-document-identities", "supplier-document-status", "supplier-invoice-identities", "ttc-eligible-recovery-principal", "uiwire15-journey", "watchdog-panel", "workspace-job-id"]);
 for (const id of ["captured-job-workspace", "commercial-integrity", "customer-messages", "customer-messages-title", "diary-mode", "diary-text", "final-check", "final-check-title", "job-diary", "job-diary-title", "materials", "next-workday-readiness", `parties-${jobId}`, "practice-facts", "practice-facts-title", "practice-receipts", "practice-receipts-title", "purchase-orders", "recovery-allocations", "recovery-allocation-title", "recovery-cases", "relevance-inbox", "site-work", "site-work-title", "supplier-documents", "supplier-match", "things-to-check"]) expect(ids(html, "id")).toContain(id);
});
it.each(["draft", "quoting", "accepted", "live", "invoiced", "paid", "lost"] as const)("provides real scope and quote anchors for %s", status => {
 const html = renderToStaticMarkup(workspace(status));
 expect(ids(html, "id")).toContain("scope");
 expect(ids(html, "id")).toContain("quote");
});

it.each([
 ["#scope", "#scope"], ["#quote", "#quote"], ["#work-proof", "#work-proof h2"],
 ["#variations-title", "#variations-title"], ["#final-account-title", "#final-account-title"],
 ["#practice-tools", "#practice-tools"], [`#invoice-${jobId}`, null],
])("focuses and scrolls the destination after navigating to %s", (fragment, selector) => {
 const destination = { tabIndex: 0, focus: vi.fn(), scrollIntoView: vi.fn() };
 const root = { contains: (node: unknown) => node === destination, querySelector: vi.fn(() => destination) };
 vi.stubGlobal("document", { getElementById: (id: string) => id === "captured-job-workspace" ? root : destination });
 workspace("live", fragment!);
 // The fourth shell effect restores focus once the selected view has mounted.
 state.effects[3]!();
 if (selector) expect(root.querySelector).toHaveBeenCalledWith(selector);
 expect(destination.tabIndex).toBe(-1);
 expect(destination.focus).toHaveBeenCalledWith({ preventScroll: true });
 expect(destination.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
});

it("renders the full live-job journey before every practice tool", () => {
 const html = renderToStaticMarkup(workspace("live", "#quote"));
 const markers = ['<h1>Fictional decorating job', 'data-testid="uiwire15-journey"', 'Customer and site', 'id="scope"', 'Price the work', 'id="site-work"', 'id="job-diary"', 'id="customer-messages"', 'id="work-proof"', 'class="variation-workspace"', 'id="final-account-title"', 'id="final-check"', '<h3>Customer invoice', 'id="practice-tools"', 'id="materials"', 'data-testid="prevention-panel"'];
 const positions = markers.map(marker => html.indexOf(marker));
 expect(positions.every(position => position >= 0), JSON.stringify(markers.filter((_,i) => positions[i]! < 0))).toBe(true);
 expect(positions).toEqual([...positions].sort((a,b) => a-b));
 expect(html.match(/data-testid="final-check-reveal"/gu)).toHaveLength(1);
 const divider = html.indexOf('id="practice-tools"');
 for (const id of ["materials", "purchase-orders", "supplier-documents", "supplier-match", "things-to-check", "next-workday-readiness", "relevance-inbox", "commercial-integrity", "recovery-cases", "practice-receipts", "practice-facts", "recovery-allocations"]) {
  expect(html.indexOf(`id="${id}"`), id).toBeGreaterThan(divider);
 }
 for (const label of ["First job trial and card", "Recovery practice guide"]) expect(html.indexOf(label)).toBeGreaterThan(divider);
});

it.each(["quoting", "accepted", "live", "invoiced", "paid"] as const)("keeps Price the work on a plain saved %s job", status => {
 const html = renderToStaticMarkup(workspace(status));
 expect(html).toContain('class="review confirmed-scope"');
 expect(html).toContain('>Price the work</button>');
 expect(html).not.toContain('class="quote-editor"');
});

it.each(["#quote", "#job-diary", "#customer-messages", "#variations-title", "#final-account-title"])("opens the live editor for explicit anchor %s", fragment => {
 const html = renderToStaticMarkup(workspace("live", fragment));
 expect(html).toContain('class="quote-editor"');
 expect(html).toContain(`data-job-id="${jobId}"`);
});

it("keeps the review key stable when a command advances a plain job URL", () => {
 function reviewKey(status: CaptureWorkspaceResponse["status"]) {
  const tree = workspace(status);
  function find(node: React.ReactNode): React.ReactElement | undefined {
   if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return;
   if (typeof node.type === "function" && node.type.name === "ReviewProposal") return node;
   return React.Children.toArray(node.props.children).map(find).find(Boolean);
  }
  return find(tree)?.key;
 }
 expect(reviewKey("quoting")).toBeTruthy();
 expect(reviewKey("live")).toBe(reviewKey("quoting"));
});


it.each(["live", "invoiced", "paid"] as const)("keeps independent job controls on a plain saved %s job and scope anchor", status => {
 for (const fragment of ["", "#scope"]) {
  const html = renderToStaticMarkup(workspace(status, fragment));
  for (const marker of ['id="site-work"', 'id="job-diary"', 'id="customer-messages"', 'id="final-check"']) {
   expect(html, `${status}${fragment}: ${marker}`).toContain(marker);
   expect(html.indexOf(marker)).toBeLessThan(html.indexOf('id="practice-tools"'));
  }
  expect(html).toContain('>Price the work</button>');
  expect(html).not.toContain('class="quote-editor"');
 }
});

it("does not put live job controls inside the quote fieldset or sidebar", () => {
 renderToStaticMarkup(workspace("live", "#quote"));
 let activationFound = false;
 function inspect(node: React.ReactNode, ancestors: React.ReactElement<{ className?: string }>[]=[]) {
  React.Children.forEach(node, child => {
   if (!React.isValidElement<{ children?: React.ReactNode; className?: string }>(child)) return;
   if (child.props.className === "activation-card") {
    activationFound = true;
    expect(ancestors.some(parent => parent.type === "fieldset")).toBe(false);
    expect(ancestors.some(parent => parent.props.className === "quote-side")).toBe(false);
   }
   inspect(child.props.children, [...ancestors, child]);
  });
 }
 inspect(state.editor);
 expect(activationFound).toBe(true);
});

it("handles fragment navigation without fetching or unmounting the workspace", () => {
 workspace("quoting");
 const listeners = new Map<string, () => void>();
 const fetch = vi.fn();
 vi.stubGlobal("fetch", fetch);
 vi.stubGlobal("window", {
  location: {hash:"#quote"},
  addEventListener: (name:string, fn:()=>void) => listeners.set(name, fn),
  removeEventListener: vi.fn(),
 });
 // The second shell effect installs navigation; the initial-load effect is separate.
 const cleanup = state.effects[1]!() as () => void;
 listeners.get("hashchange")!();
 expect(fetch).not.toHaveBeenCalled();
 cleanup();
});
it.each(["#scope", "#quote", "#job-diary", "#work-proof", "#final-account-title"])("keeps component identity across %s navigation", fragment => {
 function review(node:React.ReactNode):React.ReactElement | undefined {
  if (Array.isArray(node)) return node.map(review).find(Boolean);
  if (!React.isValidElement<{children?:React.ReactNode}>(node)) return;
  if (typeof node.type === "function" && node.type.name === "ReviewProposal") return node;
  return review(node.props.children);
 }
 expect(review(workspace("live",fragment))!.key).toBe(review(workspace("live"))!.key);
});
