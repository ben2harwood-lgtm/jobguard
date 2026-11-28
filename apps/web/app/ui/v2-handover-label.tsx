import React from "react";
import type { HandoverContent, HandoverRefusal } from "@jobguard/api/workspace";

/** V2-G2 wording for the handover screen, following M3's Handover mock. Pure: tested with renderToStaticMarkup. */
export const handoverIntro = "Choose what goes in. No amounts go in the customer’s pack. Missing certificates are listed as missing.";
export const handoverEmpty = ["No handover draft yet", "Finish the site work, then choose what goes in the customer’s pack."] as const;
export const handoverProblem = "This handover preview could not open. Nothing new was recorded or sent. Try again.";
export const handoverTitle = (nextVersion: number) => `Prepare handover · version ${nextVersion}`;
export const handoverVersionLine = (version: { version: number; recordedAt: string }) =>
  `Version ${version.version} · saved ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/London" }).format(new Date(version.recordedAt))} · kept unchanged`;
export const handoverSaved = (version: number) => `Version ${version} saved. It stays exactly as saved; a later change needs a new version.`;
export function handoverRefusalText(refusal: HandoverRefusal) {
  return refusal.reason === "amount" ? `Has an amount: leave amounts out of the customer’s pack · ${refusal.line}`
    : `${refusal.line} is ticked but has nothing in it. Tick an item or untick the section.`;
}
export function handoverProblemText(code: string | undefined) {
  if (code === "HANDOVER_VERSION_CONFLICT") return "A newer version was saved. The page has reloaded; check it and save again.";
  if (code === "HANDOVER_SOURCE_CHANGED") return "Something you chose changed (for example a change was rejected or a photo removed). The page has reloaded.";
  if (code === "HANDOVER_LINE_REFUSED") return "A line has an amount or a ticked section is empty. Fix it and save again.";
  if (code === "HANDOVER_NOTHING_CHOSEN") return "Tick at least one section.";
  return "Not saved. Try again.";
}

/** The customer's view of one version, exactly as stored. */
export function HandoverPack({ content }: { content: HandoverContent }) {
  return <>{content.sections.map(section => <section key={section.key} aria-label={section.title} className="card">
    <h3 className="card-title">{section.title}</h3>
    <div className="card-body">{section.lines.map((line, index) => <p key={index}>{line}</p>)}</div>
  </section>)}</>;
}
