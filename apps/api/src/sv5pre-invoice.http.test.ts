import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Inject, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterEach, expect, it, vi } from "vitest";
import { FinalAccountLockError } from "@jobguard/core";
import { CustomerInvoiceController } from "./customer-invoice.controller.js";
import { CustomerInvoiceApplication } from "./customer-invoice.application.js";

Inject(Pool)(CustomerInvoiceController, undefined, 0);
let app: INestApplication | undefined;
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); });
it.each(["FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED"] as const)("[PRE-Q4-01/PRE-Q4-02] legacy HTTP issue returns %s", async code => {
 // HTTP adapter contract with an injected refusal; SQL authority is tested separately.
 vi.spyOn(CustomerInvoiceApplication.prototype, "issue").mockRejectedValue(new FinalAccountLockError(code));
 const module = await Test.createTestingModule({ controllers: [CustomerInvoiceController], providers: [{ provide: Pool, useValue: {} }] }).compile();
 app = module.createNestApplication(); await app.init();
 const result = await request(app.getHttpServer()).post(`/jobs/${randomUUID()}/customer-invoices`).send({});
 expect(result.status).toBe(409);
 expect(result.body).toEqual({ version: "final-check-invoice-error.v1", code });
 expect(result.headers["cache-control"]).toBe("no-store");
});
it("[PRE-Q4-01] arbitrary database messages are not exposed by the invoice filter", async () => {
 vi.spyOn(CustomerInvoiceApplication.prototype, "issue").mockRejectedValue(new Error("private SQL diagnostic"));
 const module = await Test.createTestingModule({ controllers: [CustomerInvoiceController], providers: [{ provide: Pool, useValue: {} }] }).compile();
 app = module.createNestApplication(); await app.init();
 const result = await request(app.getHttpServer()).post(`/jobs/${randomUUID()}/customer-invoices`).send({});
 expect(result.status).toBe(500); expect(JSON.stringify(result.body)).not.toContain("private SQL diagnostic");
});
