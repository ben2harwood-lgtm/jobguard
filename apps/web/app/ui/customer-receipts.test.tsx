import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CustomerReceipts } from "./customer-receipts";
import type { PracticeReceiptView } from "../../../api/src/customer-invoice.contracts";

vi.mock("@jobguard/api/customer-invoice-contracts", () => import("../../../api/src/customer-invoice.contracts.js"));
vi.mock("./customer-payment-status", () => ({ notifyInvoiceChanged: vi.fn() }));
// Use the repository's hook-driven component test pattern, including dependency
// changes and cleanup so delayed reads/writes can be exercised without a browser.
const hooks = vi.hoisted(() => {
 let cursor = 0, slots: unknown[] = [], pending: (() => void)[] = [];
 let cleanups: (() => void)[] = [];
 const changed = (old: readonly unknown[] | undefined, next: readonly unknown[]) => !old || next.some((v, i) => !Object.is(v, old[i]));
 return {
  render() { cursor = 0; },
  reset() { cleanups.forEach(fn => fn()); cleanups = []; slots = []; pending = []; cursor = 0; },
  effects() { pending.splice(0).forEach(fn => fn()); },
  useState(initial: unknown) { const store = slots, i = cursor++; if (!(i in store)) store[i] = typeof initial === "function" ? initial() : initial; return [store[i], (v: unknown) => { store[i] = typeof v === "function" ? v(store[i]) : v; }]; },
  useRef(initial: unknown) { const i = cursor++; return slots[i] ??= { current: initial }; },
  useCallback(fn: unknown, deps: readonly unknown[]) { const i = cursor++, old = slots[i] as { deps: readonly unknown[]; fn: unknown } | undefined; if (changed(old?.deps, deps)) slots[i] = { deps, fn }; return (slots[i] as { fn: unknown }).fn; },
  useEffect(fn: () => void | (() => void), deps: readonly unknown[]) { const i = cursor++, old = slots[i] as readonly unknown[] | undefined; if (changed(old, deps)) { slots[i] = deps; pending.push(() => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); }); } },
 };
});
vi.mock("react", async original => ({ ...await original<typeof React>(), ...hooks }));
type Element = React.ReactElement<Record<string, unknown>>;
const jobId = "18000000-0000-4000-8000-000000000001", invoiceId = "18000000-0000-4000-8000-000000000002";
const otherId = "18000000-0000-4000-8000-000000000003";
const onChanged = vi.fn(), fetch = vi.fn();
let props = { jobId, invoiceId, onChanged }, identity = "";
function nodes(node: React.ReactNode): Element[] {
 if (Array.isArray(node)) return node.flatMap(nodes);
 if (!React.isValidElement<Record<string, unknown>>(node)) return [];
 return [node, ...nodes(node.props.children as React.ReactNode)];
}
function render() {
 hooks.render();
 let tree: React.ReactNode = CustomerReceipts(props);
 if (React.isValidElement(tree) && typeof tree.type === "function" && identity !== tree.key) {
  hooks.reset(); hooks.render(); identity = tree.key ?? "";
 }
 while (React.isValidElement(tree) && typeof tree.type === "function") tree = (tree.type as (p: unknown) => React.ReactNode)(tree.props);
 hooks.effects(); return tree;
}
function input() { return nodes(render()).find(n => n.props["data-testid"] === "uiwire12-receipt-amount")!; }
function type(value: string, id = "uiwire12-receipt-amount") { const n = nodes(render()).find(n => n.props["data-testid"] === id)!; (n.props.onChange as (e: unknown) => void)({ target: { value } }); }
function button(name: string) { return nodes(render()).find(n => n.type === "button" && n.props.children === name)!; }
function click(name: string) { (button(name).props.onClick as () => void)(); }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const response = (data: unknown) => ({ ok: true, json: async () => data });
function saved(balancePence = 108000): PracticeReceiptView {
 return { version: 1, environment: "synthetic_demo", jobId: props.jobId, invoice: { id: props.invoiceId, number: "DEMO-CUST-000001", issuedOn: "2026-11-09", recipient: "practice@example.invalid", pdfSha256: "a".repeat(64), finalAccountRevisionId: otherId, sourceHash: "b".repeat(64), netPence: 90000, taxPence: 18000, totalPence: 108000, balancePence, customerCreditPence: 0, delivery: "simulated_delivery", paidPence: Math.max(0, 108000 - balancePence) }, receipts: [], eligibleRecoveryPrincipalPence: 0, baseCreditPence: 0 };
}
function receipt(amountPence = 20000) { return { id: otherId, paidOn: "2024-02-29", amountPence, method: "bank_transfer", reference: "Fictional receipt", recordedAt: "2026-11-13T10:00:00Z", reversal: null }; }
function deferred() { let resolve!: (value: ReturnType<typeof response>) => void; const promise = new Promise<ReturnType<typeof response>>(r => { resolve = r; }); return { promise, resolve }; }
async function mount(balance = 108000) { fetch.mockResolvedValueOnce(response(saved(balance))); render(); await tick(); }
beforeEach(() => { props = { jobId, invoiceId, onChanged }; identity = ""; fetch.mockReset(); onChanged.mockReset(); vi.stubGlobal("React", React); vi.stubGlobal("fetch", fetch); });
afterEach(() => { hooks.reset(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("receipt amount starts at the saved balance and preserves a typed partial payment", async () => {
 await mount(); expect(input().props.value).toBe("1080.00");
 type("123.45"); fetch.mockResolvedValueOnce(response(saved())); click("Refresh receipt history"); await tick();
 expect(input().props.value).toBe("123.45");
 type(""); fetch.mockResolvedValueOnce(response(saved(98000))); click("Refresh receipt history"); await tick();
 expect(input().props.value).toBe("");
});
it.each([[108037, "1080.37"], [1, "0.01"], [0, ""], [1000000000000, "10000000000.00"]])("formats saved balance %i exactly", async (balance, expected) => { await mount(balance as number); expect(input().props.value).toBe(expected); });
it("resets from successful partial/full receipts, credit and reversal while retaining saved payment dates", async () => {
 await mount(); type("200.00"); type("2024-02-29", "uiwire12-receipt-date");
 const partial = { ...saved(88000), receipts: [receipt()] };
 fetch.mockResolvedValueOnce(response(partial)); click("Record practice receipt"); await tick();
 expect(input().props.value).toBe("880.00"); expect(JSON.parse(fetch.mock.calls[1]![1].body)).toMatchObject({ amountPence: 20000, paidOn: "2024-02-29" });
 type("77.77"); const credit = { ...partial, invoice: { ...partial.invoice, balancePence: 76000, creditedPence: 12000 } };
 fetch.mockResolvedValueOnce(response(credit)); click("Refresh receipt history"); await tick(); expect(input().props.value).toBe("77.77");
 type("760.00"); const full = { ...credit, invoice: { ...credit.invoice, balancePence: 0, paidPence: 96000 }, receipts: [receipt(), { ...receipt(76000), id: invoiceId, paidOn: "2024-03-01" }] };
 fetch.mockResolvedValueOnce(response(full)); click("Record practice receipt"); await tick(); expect(input().props.value).toBe("");
 const reversed = { ...full, invoice: { ...full.invoice, balancePence: 76000, paidPence: 20000 }, receipts: [receipt(), { ...full.receipts[1]!, reversal: { id: jobId, reason: "Fictional correction", reversedAt: "2026-11-13T11:00:00Z" } }] };
 fetch.mockResolvedValueOnce(response(reversed)); click("Reverse this receipt"); await tick(); expect(input().props.value).toBe("760.00");
 const history = nodes(render()).filter(n => n.props["data-testid"] === "uiwire12-receipt-history");
 expect(JSON.stringify(history)).toContain("2024-02-29"); expect(JSON.stringify(history)).toContain("2024-03-01");
 expect(onChanged).toHaveBeenCalledTimes(3);
});
it("reopening starts at the current balance and clears all invoice-specific state immediately", async () => {
 await mount(); type("12.00"); type("2024-02-29", "uiwire12-receipt-date");
 props = { ...props, invoiceId: otherId }; const pending = deferred(); fetch.mockReturnValueOnce(pending.promise);
 expect(nodes(render()).some(n => n.props["data-testid"] === "uiwire12-receipt-amount")).toBe(false);
 pending.resolve(response(saved(12345))); await tick(); expect(input().props.value).toBe("123.45");
 props = { ...props, invoiceId }; fetch.mockResolvedValueOnce(response(saved(88000))); render(); await tick(); expect(input().props.value).toBe("880.00");
});
it.each(["failed", "malformed", "wrong job", "wrong invoice"])("does not invent a balance after %s reads", async kind => {
 vi.useFakeTimers();
 const invalid = kind === "malformed" ? {} : kind === "wrong job" ? { ...saved(), jobId: otherId } : { ...saved(), invoice: { ...saved().invoice, id: otherId } };
 fetch.mockResolvedValue(kind === "failed" ? { ok: false } : response(invalid)); render();
 await vi.advanceTimersByTimeAsync(2000);
 expect(nodes(render()).some(n => n.props["data-testid"] === "uiwire12-receipt-amount")).toBe(false);
 expect(JSON.stringify(render())).toContain("No balance has been invented");
 fetch.mockResolvedValue(response(saved(12345))); click("Try receipt history again"); await vi.advanceTimersByTimeAsync(1); expect(input().props.value).toBe("123.45");
});
it("ignores obsolete reads and command replies after job or invoice navigation", async () => {
 const oldRead = deferred(); fetch.mockReturnValueOnce(oldRead.promise); render();
 const old = saved(); props = { ...props, jobId: otherId }; await mount(12345);
 oldRead.resolve(response(old)); await tick(); expect(input().props.value).toBe("123.45");
 const oldWrite = deferred(); fetch.mockReturnValueOnce(oldWrite.promise); click("Record practice receipt");
 props = { ...props, invoiceId: otherId }; await mount(54321);
 oldWrite.resolve(response({ ...saved(0), jobId: otherId, invoice: { ...saved(0).invoice, id: invoiceId } })); await tick();
 expect(input().props.value).toBe("543.21"); expect(onChanged).not.toHaveBeenCalled();
});
it("a stale same-invoice read cannot replace a saved command; refresh during a write cannot start a read", async () => {
 await mount(); const record = button("Record practice receipt").props.onClick as () => void;
 const read = deferred(); fetch.mockReturnValueOnce(read.promise); click("Refresh receipt history");
 const write = deferred(); fetch.mockReturnValueOnce(write.promise); record();
 click("Refresh receipt history"); expect(fetch).toHaveBeenCalledTimes(3);
 write.resolve(response({ ...saved(0), receipts: [receipt(108000)] })); await tick();
 read.resolve(response(saved())); await tick(); expect(input().props.value).toBe(""); expect(onChanged).toHaveBeenCalledTimes(1);
});
it("latest same-invoice read wins without replacing typed input", async () => {
 await mount(); type("32.10"); const first = deferred(), second = deferred();
 fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 click("Refresh receipt history"); click("Refresh receipt history");
 second.resolve(response({ ...saved(0), invoice: { ...saved(0).invoice, customerCreditPence: 123 } })); await tick();
 first.resolve(response(saved())); await tick(); expect(input().props.value).toBe("32.10");
 expect(JSON.stringify(render())).toContain("GBP 1.23");
});
it.each(["transport", "server", "malformed", "wrong identity"])("keeps writes paused after an unknown %s result, even after refreshing", async kind => {
 await mount();
 if (kind === "transport") fetch.mockRejectedValueOnce(new Error("lost"));
 else fetch.mockResolvedValueOnce(kind === "server" ? { ok: false, status: 500 } : response(kind === "malformed" ? {} : { ...saved(), jobId: otherId }));
 click("Record practice receipt"); click("Record practice receipt"); await tick(); expect(fetch).toHaveBeenCalledTimes(2);
 fetch.mockResolvedValueOnce(response(saved(0))); click("Refresh receipt history"); await tick();
 expect(button("Record practice receipt").props.disabled).toBe(true); click("Record practice receipt"); expect(fetch).toHaveBeenCalledTimes(3);
 expect(input().props.value).toBe("1080.00");
});
it("retains amount/date validation, reversal reasons and refused-command edits", async () => {
 await mount(); type("1.001"); click("Record practice receipt"); await tick(); expect(fetch).toHaveBeenCalledTimes(1);
 type("2.00"); type("2025-02-29", "uiwire12-receipt-date"); click("Record practice receipt"); await tick(); expect(fetch).toHaveBeenCalledTimes(1);
 type("2024-02-29", "uiwire12-receipt-date"); fetch.mockResolvedValueOnce({ ok: false, status: 409 }); click("Record practice receipt"); await tick(); expect(input().props.value).toBe("2.00");
 fetch.mockResolvedValueOnce(response({ ...saved(107800), receipts: [receipt(200)] })); click("Refresh receipt history"); await tick();
 type("x", "uiwire12-reversal-reason"); click("Reverse this receipt"); await tick(); expect(fetch).toHaveBeenCalledTimes(3);
});
it("failed background reads retain saved figures and the typed amount", async () => {
 await mount(); type("42.37"); vi.useFakeTimers(); fetch.mockResolvedValue({ ok: false });
 click("Refresh receipt history"); await vi.advanceTimersByTimeAsync(2000);
 expect(input().props.value).toBe("42.37"); expect(JSON.stringify(render())).toContain("No balance has been invented");
 expect(button("Record practice receipt").props.disabled).toBe(false);
});
it("ignores a read body arriving after a command saves on the same invoice", async () => {
 await mount(); const record = button("Record practice receipt").props.onClick as () => void;
 let resolveBody!: (value: unknown) => void;
 fetch.mockResolvedValueOnce({ ok: true, json: () => new Promise(resolve => { resolveBody = resolve; }) });
 click("Refresh receipt history"); await tick();
 fetch.mockResolvedValueOnce(response({ ...saved(0), receipts: [receipt(108000)] })); record(); await tick();
 resolveBody(saved()); await tick(); expect(input().props.value).toBe(""); expect(onChanged).toHaveBeenCalledTimes(1);
});
