import { z } from "zod";

export const supplierFixtureIds = ["materials-B-delivery", "materials-B-invoice", "materials-B-credit", "pending", "corrupt", "oversized", "unreadable", "password-protected", "multi-page-invoice"] as const;
export const supplierDocumentIntakeV1 = z.object({
  version: z.literal("supplier-document-intake.v1"),
  fixtureId: z.enum(supplierFixtureIds),
  channel: z.enum(["picker", "fixture_mail"]),
  alias: z.string().max(200).optional(),
  expectedRevision: z.number().int().nonnegative(),
  remoteUrl: z.never().optional(), attachmentPath: z.never().optional(), partial: z.literal(false).optional(),
}).strict();
export const goodsReceiptV1 = z.object({version:z.literal("goods-receipt.v1"),accepted:z.string().regex(/^\d+(?:\.\d+)?$/),rejected:z.string().regex(/^\d+(?:\.\d+)?$/),expectedRevision:z.number().int().nonnegative()}).strict();
export type SupplierDocumentIntake=z.infer<typeof supplierDocumentIntakeV1>;

export const supplierFixtures = {
  "materials-B-delivery": {type:"delivery",number:"DEL-MB-001",media:"application/pdf",bytes:"%PDF-1.4\nSynthetic delivery: 10 each\n%%EOF",pages:1},
  "materials-B-invoice": {type:"invoice",number:"INV-MB-001",media:"text/plain",bytes:"FICTIONAL SUPPLIER INVOICE INV-MB-001\n10 each @ GBP 25.00\nNET GBP 250.00",pages:1},
  "materials-B-credit": {type:"credit",number:"CR-MB-001",media:"application/pdf",bytes:"%PDF-1.4\nSynthetic supplier credit CR-MB-001 GBP 90.00\n%%EOF",pages:1},
  "pending": {type:"invoice",number:null,media:"application/pdf",bytes:"generated incomplete fixture",pages:1,hold:"Upload is incomplete"},
  "corrupt": {type:"invoice",number:null,media:"application/pdf",bytes:"not-a-pdf",pages:1,hold:"Corrupt document"},
  "oversized": {type:"invoice",number:null,media:"application/pdf",bytes:"generated oversized fixture",pages:1,hold:"Document exceeds the 10 MB practice limit"},
  "unreadable": {type:"invoice",number:null,media:"image/png",bytes:"generated unreadable image fixture",pages:1,hold:"Document is unreadable"},
  "password-protected": {type:"invoice",number:null,media:"application/pdf",bytes:"%PDF synthetic encrypted",pages:1,hold:"Password-protected documents cannot be reviewed"},
  "multi-page-invoice": {type:"invoice",number:"INV-MB-002",media:"application/pdf",bytes:"%PDF synthetic pages one and two",pages:2},
} as const;
