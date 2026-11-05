"use client";
import React from "react";
import { extraApprovalInboxFindings, groupInbox, type ExtraApprovalInboxRow } from "@jobguard/core";

/** Authority, current request and escalation eligibility come only from the existing queue read. */
export function MustDecide({ queue }: { queue: readonly ExtraApprovalInboxRow[] }) {
  const { mandatory } = groupInbox(extraApprovalInboxFindings(queue), 0);
  return <section aria-labelledby="must-decide-heading" data-testid="must-decide">
    <h2 id="must-decide-heading">Must decide</h2>
    {mandatory.length === 0 ? <p>No extras waiting for your decision.</p> : <ul>
      {mandatory.map((item, index) => <li key={item.key}>
        <a href={item.sources[0]} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44, padding: "0 8px", color: "#164d35", background: "#fff" }}>{item.title} {index + 1}</a>
      </li>)}
    </ul>}
  </section>;
}
