import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { coreLoopActionsV1, captureRequestV1 } from "@jobguard/core";
import { reviewSaveCommandV1, reviewConfirmCommandV1 } from "./capture/contracts.js";
import { quoteDraftCommandV1, quoteSendCommandV1, quoteAcceptanceCommandV1, practiceActivationCommandV1 } from "./quote/contracts.js";
import { decisionResolutionWebCommandV1 } from "./decisions/contracts.js";
import { proofCommandV1 } from "./proof/contracts.js";
import { variationCommandV1 } from "./variation/contracts.js";
import { finalAccountCommandV1 } from "./final-account.contracts.js";
import { practiceInvoiceIssueV1, practiceReceiptRecordV1 } from "./customer-invoice.contracts.js";

const postExportPattern = /\bexport\s+(?:async\s+function\s+POST\s*\(|function\s+POST\s*\(|const\s+POST\s*=)|\bexport\s*\{[^}]*\bPOST\b[^}]*\}/u;

describe("M3-6 shared views use the existing web command contracts", () => {
  it.each([
    ["async function", "export async function POST() {}", true],
    ["function", "export function POST() {}", true],
    ["const", "export const POST = () => {};", true],
    ["named export", "const POST = () => {}; export { GET, POST };", true],
    ["GET only", "export async function GET() {}", false],
    ["PUT only", "export const PUT = () => {};", false],
  ])("recognizes POST exports: %s", (_style, source, expected) => {
    expect(postExportPattern.test(source)).toBe(expected);
  });

  it("names the exact existing command versions rather than a native-only command family", () => {
    const actual = {
      capture: captureRequestV1.shape.contractVersion.value,
      saveReview: reviewSaveCommandV1.shape.contractVersion.value,
      confirmReview: reviewConfirmCommandV1.shape.contractVersion.value,
      saveQuote: quoteDraftCommandV1.shape.contractVersion.value,
      acceptQuote: quoteAcceptanceCommandV1.shape.version.value,
      switchLive: practiceActivationCommandV1.shape.version.value,
      sendQuote: quoteSendCommandV1.shape.version.value,
      dismissDecision: decisionResolutionWebCommandV1.shape.version.value,
      completeProof: proofCommandV1.options[0].shape.version.value,
      proposeVariation: variationCommandV1.options[0].shape.version.value,
      approveVariation: variationCommandV1.options[2].shape.version.value,
      assembleFinalAccount: finalAccountCommandV1.shape.version.value,
      issueInvoice: practiceInvoiceIssueV1.shape.version.value,
      recordPayment: practiceReceiptRecordV1.shape.version.value,
    };
    for (const action of Object.keys(actual) as (keyof typeof actual)[])
      expect(coreLoopActionsV1[action].contract).toBe(actual[action]);
  });
  it("points only to existing web POST routes", () => {
    for (const entry of Object.values(coreLoopActionsV1)) {
      const route = fileURLToPath(new URL(`../../web/app${entry.path}/route.ts`, import.meta.url));
      expect(existsSync(route), entry.path).toBe(true);
      expect(readFileSync(route, "utf8"), entry.path).toMatch(postExportPattern);
    }
  });
});
