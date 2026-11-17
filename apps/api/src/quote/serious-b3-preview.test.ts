import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { QuoteDeliveryRepository, type QuoteDeliveryView } from "@jobguard/db";
import { quoteDocumentV1 } from "@jobguard/core";
import { PracticeAccess } from "../practice-access.js";
import { QuoteApplication } from "./quote.application.js";

afterEach(() => vi.restoreAllMocks());
it("S10 preview metadata names the returned artifact when A is reused after B", async () => {
  const documentId = randomUUID(), job = randomUUID();
  const document = quoteDocumentV1.parse({schemaVersion:"quote-document.v1",documentVersion:1,reference:"Q-0001",quoteRevisionId:randomUUID(),currency:"GBP",issuer:{name:"Synthetic Builder",address:["Fictional Road"],email:"builder@example.invalid"},customer:{name:"Synthetic Customer",address:["Fictional Street"],email:"a@example.invalid"},lines:[{scopeItemId:randomUUID(),description:"Synthetic work",quantity:"2",unit:"item",netPence:20000}],exclusions:[],qualifications:[],subtotalPence:20000,discountPence:0,netPence:20000,taxPence:4000,totalPence:24000});
  const a: QuoteDeliveryView = {documentId,documentVersion:1,quoteRevision:1,contentHash:"a".repeat(64),recipient:"a@example.invalid",status:"previewed",attempts:0,receiptCount:0,effects:{platformDebt:0,chargeAttempts:0,realExternalActions:0}};
  const b: QuoteDeliveryView = {...a,documentId:randomUUID(),documentVersion:2,quoteRevision:2,contentHash:"b".repeat(64),recipient:"b@example.invalid"};
  vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({context:{tenantId:randomUUID()}} as Awaited<ReturnType<PracticeAccess["job"]>>);
  vi.spyOn(QuoteDeliveryRepository.prototype,"preview").mockResolvedValue({documentId,document,hash:a.contentHash,pdf:new Uint8Array()});
  // The database's latest projection belongs to B; a named lookup belongs to A.
  vi.spyOn(QuoteDeliveryRepository.prototype,"view").mockImplementation(async (...args) => (args as unknown[])[2] === documentId ? a : b);
  const response = await new QuoteApplication({} as Pool).preview(job,{version:"quote-preview-command.v1",recipient:"a@example.invalid"});
  expect(response.view).toEqual(a);
  expect(response.view?.recipient).toBe(response.document.customer.email);
  expect(response.view?.documentVersion).toBe(response.document.documentVersion);
});
