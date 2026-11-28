import type { ReviewCaptureResult } from "./review-proposal";

// UI-boundary fixtures: expectations come from these fictional spoken words.
// They intentionally bypass extraction, which has separate attack lanes.
export const HEAD_UNDER_TEST = "49755b620ccf0223e64575006cd4590c77595ca2";
export const ARTIFACT_DIR = "/tmp/jobguard-rt10-49755b62";
export const longDescription = `Paint the walls with two coats of washable paint, ${"including the reveals and edges, ".repeat(16)}`.slice(0, 500);
export const longRoom = `Fictional north wing ${"extended family sitting room ".repeat(3)}`.slice(0, 100);

export function mobileQuote(count = 1, options: { long?: boolean; questions?: number; maximum?: boolean } = {}): ReviewCaptureResult {
  const room = options.long ? longRoom : "Kitchen";
  const lines = Array.from({ length: count }, (_, index) => {
    const description = options.long ? `${index + 1}: ${longDescription}`.slice(0, 500) : `Paint panel ${index + 1}`;
    const price = options.maximum ? 99999999 : 12500;
    return {
      id: crypto.randomUUID(), scopeItemId: crypto.randomUUID(), origin: "proposal" as const,
      description, room, category: "Decorating", quantity: "1", unit: "item",
      unitPricePence: price, disposition: "proposed" as const, dismissalReason: null,
      parentScopeItemIds: [], sourceExcerpt: `In the ${room}. ${description} for £${(price / 100).toFixed(2)}.`,
    };
  });
  const questions = Array.from({ length: options.questions ?? 0 }, (_, index) => ({
    id: crypto.randomUUID(), question: `Which finish should I use on panel ${index + 1}?`,
    blocking: true, disposition: "unresolved" as const, answer: null,
  }));
  const jobId = crypto.randomUUID(), proposalId = crypto.randomUUID(), reviewId = crypto.randomUUID();
  return {
    version: 1, environment: "synthetic_demo", captureId: crypto.randomUUID(), jobId, proposalId, reviewId, status: "draft",
    source: { kind: "text", version: 1, text: lines.map(line => line.sourceExcerpt).join("\n"), acquisition: null, audioByteLength: 0 },
    proposal: {
      title: "RT-10 fictional practice firm: painted panels",
      lines: lines.map(line => ({ ...line, description: { value: line.description }, quantity: { value: "1" }, unit: { value: "item" }, unitPricePence: { value: line.unitPricePence }, roomInferred: false })),
      questions: questions.map(question => ({ question: { value: question.question } })),
    },
    review: { version: "proposal_review_v1", jobId, proposalId, reviewId, revision: 0, lines, questions },
  } as unknown as ReviewCaptureResult;
}
