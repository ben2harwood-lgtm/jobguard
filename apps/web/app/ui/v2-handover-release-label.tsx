import React from "react";
import type { HandoverContent } from "@jobguard/api/workspace";
import { HandoverPack } from "./v2-handover-label";

/** V2-G3 wording for releasing a handover version and the customer's pack, following M3. Pure: tested with renderToStaticMarkup. */
export const releaseIndependent = "Release is independent of the financial lock.";
export const releaseBlocked = "Finish the site work first";
export const releaseLinkNote = "Practice only: this link went to the local catcher. It is shown once; copy it now if you need it.";
export const receiptOnly = "Receipt only: acknowledging this pack does not agree the account or sign off any snag.";
export const newerReadOnly = "This version can no longer be acknowledged. Please open the newer link from your builder.";
export const newerAvailable = "Newer version available. Your builder has sent you a link to it. This page still shows the version you were sent.";
export const linkRefused = "This link can’t be opened. It may have expired. Ask your builder for a new one.";
export const linkProblem = "This pack could not open. Nothing was recorded. Try again.";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/London" }).format(new Date(iso));

export function releaseLine(row: { version: number; recipient: string; releasedAt: string; acknowledgedAt: string | null; superseded: boolean }) {
  return [`Version ${row.version} released to ${row.recipient} · ${when(row.releasedAt)}`,
    row.acknowledgedAt ? `acknowledged ${when(row.acknowledgedAt)}` : "acknowledgement pending",
    ...(row.superseded ? ["a newer version was released"] : [])].join(" · ");
}
export function releaseProblemText(code: string | undefined) {
  if (code === "HANDOVER_SITE_NOT_COMPLETE") return "Not released: finish the site work first.";
  if (code === "HANDOVER_NO_RECIPIENT") return "Not released: the job has no customer email. Add it on the job’s parties.";
  return "Not released. Try again.";
}
export const acknowledgedLine = (iso: string) => `Receipt acknowledged ${when(iso)}.`;

/** M3's CustomerPack: the released version exactly as saved, the newer-version note and the receipt-only text. */
export function CustomerPack({ firmName, version, content, newer }: { firmName: string; version: number; content: HandoverContent; newer: boolean }) {
  return <div className="form">
    {newer && <div role="status" className="note warning"><strong>{newerAvailable}</strong></div>}
    <p>From {firmName} · version {version}</p>
    <HandoverPack content={content}/>
    <p>{receiptOnly}</p>
  </div>;
}
