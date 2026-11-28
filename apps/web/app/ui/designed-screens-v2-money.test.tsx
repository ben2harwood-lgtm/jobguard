import * as React from "react";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { CustomerInvoices } from "./customer-invoices";
import { CustomerReceipts } from "./customer-receipts";
import { FinalAccountLock } from "./final-account-lock";
import { FinalCheckReveal } from "./final-check-reveal";
import { JobFinalAccount } from "./job-final-account";
import { ValuePage } from "./job-value";

// V2-SQ-I-3: the money tab's six components get #918's designed classes. Plain markup is pinned to the base
// (SQ-I-2 @ d7c3d3c45); designed markup carries the classes, and only classes change.
vi.mock("react", async original => ({ ...await original<typeof React>(), useEffect: () => undefined }));
afterEach(() => vi.unstubAllGlobals());
const jobId = "11111111-1111-4111-8111-111111111112";
const account = { id: "11111111-1111-4111-8111-111111111113", revision: 1, sourceHash: "a".repeat(64), taxPolicyVersion: "reference",
 totals: { net: { pence: 90000, currency: "GBP" }, tax: { pence: 18000, currency: "GBP" }, total: { pence: 108000, currency: "GBP" } },
 issueBlocked: false, findings: [], lines: [], proof: [], pending: [] } as never;
const guard = { code: "FINAL_ACCOUNT_LOCK_REQUIRED" as const, kind: "final" as const };
const html = (node: React.ReactElement) => { vi.stubGlobal("React", React); return renderToStaticMarkup(node); };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const flag = (designed?: boolean) => designed === undefined ? {} : { designed };
const screens: [string, (designed?: boolean) => React.ReactElement, string[]][] = [
 ["JobFinalAccount", d => <JobFinalAccount {...flag(d)} jobId={jobId}/>, ["job-final-account card card-body designed-final-account"]],
 ["FinalAccountLock", d => <FinalAccountLock {...flag(d)} jobId={jobId} account={account} onChanged={async () => undefined}/>, ["card card-body designed-account-lock"]],
 ["FinalCheckReveal", d => <FinalCheckReveal {...flag(d)} jobId={jobId}/>, ["card card-body designed-check-reveal", "btn"]],
 ["CustomerInvoices lock-bound", d => <CustomerInvoices {...flag(d)} jobId={jobId} finalAccount={account} lockGuard={guard}/>, ["btn primary", "btn"]],
 ["CustomerInvoices", d => <CustomerInvoices {...flag(d)} jobId={jobId} finalAccount={account}/>, []],
 ["CustomerReceipts", d => <CustomerReceipts {...flag(d)} jobId={jobId} invoiceId={jobId} onChanged={() => undefined}/>, []],
 ["ValuePage", d => <ValuePage {...flag(d)} jobId={jobId}/>, []],
];

it.each(screens)("%s: designed=false is today's markup and designed carries the designed classes", (name, screen, classes) => {
 const plain = html(screen(false));
 expect(html(screen(undefined))).toBe(plain);
 expect(hash(plain)).toBe(BASE[name]);
 const designed = html(screen(true));
 for (const value of classes) expect(designed).toContain(value);
 for (const value of ["designed-", "card-body", "btn"]) expect(plain).not.toContain(value);
 // Only classes change while loading: the same text and labels in the same order.
 const words = (markup: string) => markup.replace(/\sclass="[^"]*"/gu, "");
 expect(words(designed)).toBe(words(plain));
});
const BASE: Record<string, string> = {
 "JobFinalAccount": "ae5bbc23ed91e4555f46e76871c1aa6332b8e3d2d5a8d01470e1e8d0d0f527b1",
 "FinalAccountLock": "aeb1f638a2a08ad3b5bddb429cefcecb87cc5f0f51e11db192ffb9e31aeb0eab",
 "FinalCheckReveal": "9ef307615c6eceade3e88144f3369b68af83a6aac2ac4ef7a549ba0f26d92252",
 "CustomerInvoices lock-bound": "a47cf5eea244fc6bc18dadbc5748afd2144e58368f33cda8767f0cf5a55eb703",
 "CustomerInvoices": "777126f332d15009163edbc5c293843b9fce2a1d112eb31011f08c66e08cac27",
 "CustomerReceipts": "a3470ee971073e66d129c90d71795ee9e1bb30f3ee7fa9b7fb607c5497fd6bc6",
 "ValuePage": "11b63b0224798aa1db033d523d37c4286d7dbe0a17662123aafee311ba71ab8f"
};
