import { z } from "zod";
import { ZodError as LegacyZodError } from "zod/v3";

/** Keep the established public regex issue code; validation itself runs only through Zod 4. */
function parseSupplierCommand<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (parsed.error.issues.every(issue => issue.code === "invalid_format" && issue.format === "regex")) {
    // Only the legacy error constructor is used, never the vulnerable v3 array parser.
    throw new LegacyZodError(parsed.error.issues.map(issue => ({
      validation: "regex", code: "invalid_string", message: "Invalid",
      path: issue.path.map(part => typeof part === "symbol" ? String(part) : part),
    })));
  }
  throw parsed.error;
}

import { PracticeAccess } from "./practice-access.js";
import type{Pool}from"pg";import { SupplierDocumentRepository } from "@jobguard/db";import{goodsReceiptV1,supplierDocumentIntakeV1,supplierFactCorrectionV1}from"./supplier-document.contracts.js";export class SupplierDocumentApplication{ private readonly access: PracticeAccess; private repo;constructor(pool:Pool, sessionId?: string){this.access = new PracticeAccess(pool, sessionId);this.repo=new SupplierDocumentRepository(pool)}async view(jobId:string){const practice = await this.access.job(jobId);return{version:"supplier-document-workspace.v1",environment:"synthetic_demo",jobId,state:await this.repo.view(practice.context,jobId)}}async intake(jobId:string,raw:unknown){const practice = await this.access.job(jobId);return this.repo.intake(practice.context,jobId,parseSupplierCommand(supplierDocumentIntakeV1,raw))}async receipt(jobId:string,raw:unknown){const practice = await this.access.job(jobId);return this.repo.appendReceipt(practice.context,jobId,parseSupplierCommand(goodsReceiptV1,raw))}async confirm(jobId:string,raw:unknown){const practice = await this.access.job(jobId);return this.repo.confirm(practice.context,jobId,parseSupplierCommand(supplierFactCorrectionV1,raw))}}
