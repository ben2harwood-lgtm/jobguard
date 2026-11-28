// V2-SQ-I-1 (TOMMY-DEMO, copied from #918): what "Make my draft" says when the capture is refused.
// Only an empty description gets the plain line; every other refusal keeps today's text.
export function captureErrorMessage(code: string | undefined, emptyInput: boolean): string {
  if (code === "CAPTURE_ID_REUSED") return "These work details conflict with an earlier draft (CAPTURE_ID_REUSED). Your text is still here and the earlier draft is unchanged. Copy your text before returning to Jobs to start a new draft.";
  if (code === "INVALID_CAPTURE" && emptyInput) return "We could not make the draft: add the work details first. Your original text is still here; change it or try again.";
  return `We could not make the draft (${code}). Your original text is still here; change it or try again.`;
}
