// V2-G8 wording for the review request after handover. Pure: tested without a browser.
export type ReviewRequestState = "off" | "no_release" | "recipient_changed" | "open_dispute" | "unpaid_invoice" | "too_soon" | "due" | "sent";

export const reviewSwitchLabel = "Ask the customer for a review a week after the handover release";
export const reviewSend = "Send the review request (practice)";
/** What the customer gets. Practice only: the local catcher records that it went, never the text. */
export const reviewMessage = "Thank you for choosing us for your work. If you have a moment, a short review would help other customers find us. There is no need to reply.";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(iso));

export function reviewStateLine(view: { state: ReviewRequestState; dueAt: string | null; sentAt: string | null }) {
  switch (view.state) {
    case "off": return "Off. No review request is sent for this job.";
    case "no_release": return "Waits for a handover release.";
    case "recipient_changed": return "The customer contact changed after the release. Release the pack to the current customer first.";
    case "open_dispute": return "Not sent while a recovery case is open on this job.";
    case "unpaid_invoice": return "Not sent while the final invoice is unpaid.";
    case "too_soon": return `Due ${day(view.dueAt!)}, a week after the release.`;
    case "due": return "Due now. It is sent once and never repeated.";
    case "sent": return `Sent ${day(view.sentAt!)} to the practice catcher. Never sent again.`;
  }
}

export function reviewProblemText(code: string | undefined) {
  if (code === "REVIEW_REQUEST_ALREADY_SENT") return "Already sent. It is never sent twice.";
  if (code === "REVIEW_REQUEST_NOT_DUE") return "Not sent: it is not due. Nothing was recorded.";
  return "Not saved. Try again.";
}
