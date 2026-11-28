"use client";
import { useState } from "react";
import type { HandoverLinkView } from "@jobguard/api/workspace";
import { Card, Head, Note } from "../../(designed)/designed-ui";
import { CustomerPack, acknowledgedLine, linkProblem, linkRefused, newerReadOnly } from "../../ui/v2-handover-release-label";

export function CustomerPackView({ token, view, failure }: { token: string; view: HandoverLinkView | null; failure: "refused" | "problem" | null }) {
  const [acknowledgedAt, setAcknowledgedAt] = useState(view?.acknowledgedAt ?? null);
  const [error, setError] = useState<"refused" | "problem" | null>(null);
  const [busy, setBusy] = useState(false);

  async function acknowledge() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v2/handover", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "v2-handover-acknowledge.v1", token }) });
      const body = await response.json().catch(() => ({})) as { code?: string; acknowledgedAt?: string };
      if (!response.ok || !body.acknowledgedAt) { setError(body.code === "HANDOVER_LINK_REFUSED" ? "refused" : "problem"); return; }
      setAcknowledgedAt(body.acknowledgedAt);
    } catch { setError("problem"); }
    finally { setBusy(false); }
  }

  const refused = failure === "refused" || error === "refused";
  return <div className="jgd"><div className="rr-app rr-is-inner" data-persona="link">
    <main className="content" id="main" data-testid="handover-pack-page"><div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px", overflowWrap: "anywhere" }}>
      <Head kicker="HANDOVER · BY LINK" title="Your handover pack" text="Practice job: nothing real is sent. No amounts."/>
      {refused ? <div role="alert"><Note tone="warning"><strong>{linkRefused}</strong></Note></div>
        : failure === "problem" || !view ? <div role="alert"><Note tone="warning"><strong>{linkProblem}</strong></Note></div>
        : <div className="form">
          <CustomerPack firmName={view.firmName} version={view.version} content={view.content} newer={view.newerAvailable}/>
          <Card title="Receipt"><div className="card-body form">
            {acknowledgedAt ? <p role="status">{acknowledgedLine(acknowledgedAt)}</p>
              : view.newerAvailable ? <p role="status">{newerReadOnly}</p>
              : <button type="button" className="btn primary" disabled={busy} onClick={() => void acknowledge()}>Acknowledge receipt</button>}
            {error === "problem" && <p role="alert">{linkProblem}</p>}
          </div></Card>
        </div>}
    </div></main>
  </div></div>;
}
