import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { candidateM1TaxPolicy, customerVariationApprovalCommandV1, customerVariationViewV2, money } from "@jobguard/core";
import { expect, it } from "vitest";
import { extraApprovalRequest, extraPriceWords, PHOTOS_CHANGED_NOTICE, submitExtraApproval } from "./extras";

it.each([
  [14000, "£140.00 plus VAT £28.00 · total £168.00", "£168.00"],
  [5000, "£50.00 plus VAT £10.00 · total £60.00", "£60.00"],
  [1234, "£12.34 plus VAT £2.47 · total £14.81", "£14.81"],
  [-2500, "−£25.00 plus VAT −£5.00 · total −£30.00", "−£30.00"],
  [150000, "£1,500.00 plus VAT £300.00 · total £1,800.00", "£1,800.00"],
])("renders the price and approval wording for %i pence", (pence, expectedPrice, total) => {
  const { price, approval } = extraPriceWords(pence, 1);
  const html = renderToStaticMarkup(<><p>{price}</p><button>{approval}</button></>);
  expect(html).toContain(`Revision 1 · ${expectedPrice}`);
  expect(html).toContain(`<button>Approve revision 1 for ${total} including VAT</button>`);
});

it("uses the invoice tax policy for an amount that needs rounding", () => {
  const vat = candidateM1TaxPolicy.calculateGroup(money(1234), "standard_rate_20");
  const formattedVat = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(vat.pence / 100);
  expect(extraPriceWords(1234, 1).price).toContain(`plus VAT ${formattedVat}`);
});

// QW-1b: the customer screen must send the frozen photo list, or the database refuses the approval.
const sha = (c: string) => c.repeat(64);
const photo = (n: number, withdrawn = false) => ({ evidenceId: `00000000-0000-4000-8000-00000000000${n}`, sha256: sha(String(n)), receivedAt: "2026-11-24T10:00:00.000Z", withdrawn });
const extra = (photos: ReturnType<typeof photo>[]) => ({ id: "11111111-1111-4111-8111-111111111111", revision: 2, hash: sha("a"), description: "Extra socket",
  amount: { pence: 14000, currency: "GBP" as const }, approved: false, method: null, photos });
const view = (item: ReturnType<typeof extra>) => customerVariationViewV2.parse({ version: "customer-variations.v2", jobId: "22222222-2222-4222-8222-222222222222", jobRevision: 7, variations: [item] });
const commandId = "33333333-3333-4333-8333-333333333333";

it("approves an extra with two photos and sends both hashes in the order shown", async () => {
  const v = view(extra([photo(2), photo(1)]));
  const sent: unknown[] = [];
  let reloads = 0;
  const notice = await submitExtraApproval(async body => { sent.push(body); return new Response("{}", { status: 200 }); }, async () => { reloads++; }, v, v.variations[0]!, commandId);
  expect(sent).toEqual([{ version: "customer-portal-approval.v1", commandId, jobId: v.jobId, expectedJobRevision: 7,
    target: { kind: "variation", id: v.variations[0]!.id, revision: 2, hash: sha("a"), amount: { pence: 14000, currency: "GBP" }, photos: [sha("2"), sha("1")] } }]);
  expect(customerVariationApprovalCommandV1.parse(sent[0])).toEqual(sent[0]);
  expect(notice).toBe("Your approval has been recorded for that exact revision.");
  expect(reloads).toBe(1);
});

it("keeps a withdrawn photo in the approved list, because it was frozen on the revision", () => {
  const v = view(extra([photo(1), photo(2, true)]));
  expect(extraApprovalRequest(v, v.variations[0]!, commandId).target.photos).toEqual([sha("1"), sha("2")]);
});

it("still approves an extra with no photos", async () => {
  const v = view(extra([]));
  const sent: Array<{ target: { photos?: string[] } }> = [];
  const notice = await submitExtraApproval(async body => { sent.push(body as never); return new Response("{}", { status: 200 }); }, async () => {}, v, v.variations[0]!, commandId);
  expect(sent[0]!.target.photos).toEqual([]);
  expect(customerVariationApprovalCommandV1.safeParse(sent[0]).success).toBe(true);
  expect(notice).toBe("Your approval has been recorded for that exact revision.");
});

it("reloads the extras and explains when the photos changed (409 PHOTOS_CHANGED)", async () => {
  const v = view(extra([photo(1)]));
  let reloads = 0;
  const notice = await submitExtraApproval(async () => new Response(JSON.stringify({ code: "PHOTOS_CHANGED", message: "x" }), { status: 409 }),
    async () => { reloads++; }, v, v.variations[0]!, commandId);
  expect(reloads).toBe(1);
  expect(notice).toBe(PHOTOS_CHANGED_NOTICE);
  expect(notice).toBe("The photos on this extra have changed. Check them again before approving.");
});

it("reloads with the general notice for any other refusal", async () => {
  const v = view(extra([]));
  let reloads = 0;
  const notice = await submitExtraApproval(async () => new Response("not json", { status: 409 }), async () => { reloads++; }, v, v.variations[0]!, commandId);
  expect(reloads).toBe(1);
  expect(notice).toBe("Approval was not confirmed. Review the current revision before trying again.");
});
