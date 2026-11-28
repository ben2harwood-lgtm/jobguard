// V2-G9 wording for the aftercare check-up offers after handover. Pure: tested without a browser.
export type AftercareState = "off" | "no_release" | "recipient_changed" | "open_dispute" | "unpaid_invoice" | "too_soon" | "due" | "done";

export const aftercareSwitchLabel = "Offer the customer a check-up visit 6 and 12 months after the handover release";
export const aftercareSend = (months: number) => `Send the ${months}-month check-up offer (practice)`;
/** What the customer gets. Practice only: the local catcher records that it went, never the text. */
export const aftercareMessage = (months: number) =>
  `It is ${months} months since we finished your work. If you would like a free check-up visit, reply and we will arrange a time. There is no need to reply otherwise.`;

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })
  .format(new Date(iso));

export function aftercareStateLine(view: { state: AftercareState; months: number | null; nextAt: string | null }) {
  switch (view.state) {
    case "off": return "Off. No aftercare offer is sent for this job.";
    case "no_release": return "Waits for a handover release.";
    case "recipient_changed": return "The customer contact changed after the release. Release the pack to the current customer first.";
    case "open_dispute": return "Not sent while a recovery case is open on this job.";
    case "unpaid_invoice": return "Not sent while an invoice on this job is unpaid.";
    case "too_soon": return `Next offer due ${day(view.nextAt!)}.`;
    case "due": return `The ${view.months}-month offer is due now. Each offer is sent once.`;
    case "done": return "Both offers are done. Nothing more is sent.";
  }
}
export const aftercareSentLine = (row: { months: number; sentAt: string }) => `${row.months}-month offer sent ${day(row.sentAt)} to the practice catcher`;

export function aftercareProblemText(code: string | undefined) {
  if (code === "AFTERCARE_NOT_DUE") return "Not sent: no offer is due. Nothing was recorded.";
  return "Not saved. Try again.";
}
