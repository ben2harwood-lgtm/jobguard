"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card, Empty, Note, Tag, shortDate } from "../../../designed-ui";

type Row = {
  scopeItemId: string;
  version: number;
  status: "confirmed" | "needs_input";
  quoted: { description: string; quantity: string | null; unit: string | null } | null;
  measurement: {
    quantity: string; unit: string; source: "builder_typed"; confirmed: boolean;
    recordedAt: string; confirmedAt: string | null;
  } | null;
};
type Problem = { message: string; reload?: boolean };

// The same shape d1 accepts: a positive decimal with at most six places and no leading zeros.
const QUANTITY = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u;

class MeasurementRequestError extends Error {}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...(body === undefined ? {} : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new MeasurementRequestError(data.code);
  return data;
}

const title = (row: Row) => row.quoted?.description ?? "Scope item awaiting review";
const trimZeros = (quantity: string) => quantity.includes(".") ? quantity.replace(/\.?0+$/u, "") : quantity;

function describe(row: Row) {
  const { measurement, quoted } = row;
  const quote = quoted?.quantity && quoted.unit ? `Quote says ${trimZeros(quoted.quantity)} ${quoted.unit}` : "Not on the current quote";
  if (!measurement) return `No measurement yet · ${quote}`;
  const when = shortDate(measurement.confirmedAt ?? measurement.recordedAt);
  return `${trimZeros(measurement.quantity)} ${measurement.unit} · Typed by the builder${when ? ` on ${when}` : ""} · ${quote}`;
}

function question(row: Row) {
  return row.measurement
    ? `Is ${trimZeros(row.measurement.quantity)} ${row.measurement.unit} right for “${title(row)}”? Check it and confirm.`
    : `What did you measure for “${title(row)}”?`;
}

function MeasurementForm({ row, busy, save, cancel }: {
  row: Row; busy: boolean; save: (quantity: string, unit: string) => void; cancel: () => void;
}) {
  const [invalid, setInvalid] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const quantity = String(fields.get("quantity")).trim();
    const unit = String(fields.get("unit")).trim();
    if (!QUANTITY.test(quantity) || !/[1-9]/u.test(quantity)) {
      setInvalid("Enter a number above zero, like 6 or 2.5, with up to six decimal places.");
      return;
    }
    if (!unit) {
      setInvalid("Enter the unit, like m² or m.");
      return;
    }
    setInvalid("");
    save(quantity, unit);
  }
  return <form className="form" onSubmit={submit} noValidate>
    <fieldset disabled={busy} className="field-pair" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label>Measured quantity<input name="quantity" inputMode="decimal" autoComplete="off" maxLength={40}
        defaultValue={row.measurement ? trimZeros(row.measurement.quantity) : ""} required/></label>
      <label>Unit<input name="unit" maxLength={40} autoComplete="off"
        defaultValue={row.measurement?.unit ?? row.quoted?.unit ?? ""} required/></label>
    </fieldset>
    {invalid && <p role="alert">{invalid}</p>}
    <div className="form-actions">
      <button type="button" className="btn" onClick={cancel} disabled={busy}>Cancel</button>
      <button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Confirm measurement"}</button>
    </div>
  </form>;
}

export function Measurements({ jobId }: { jobId: string }) {
  const path = `/api/v2-backend/jobs/${encodeURIComponent(jobId)}/measurements`;
  const [rows, setRows] = useState<Row[] | undefined>(undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // Retrying the same unconfirmed save reuses its command id, so a lost reply replays the same receipt.
  const replay = useRef<{ payload: string; commandId: string }>(null);

  useEffect(() => {
    let current = true;
    request<{ items: Row[] }>(path).then(view => {
      if (current) setRows(view.items);
    }).catch(() => {
      if (current) setProblem({ message: "Measurements could not open. Your job is unchanged.", reload: true });
    });
    return () => { current = false; };
  }, [path]);

  async function save(row: Row, quantity: string, unit: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    setNotice("");
    const command = { version: "v2-measurement-command.v1", scopeItemId: row.scopeItemId,
      expectedVersion: row.version, quantity, unit, confirmed: true } as const;
    const payload = JSON.stringify(command);
    if (replay.current?.payload !== payload) replay.current = { payload, commandId: crypto.randomUUID() };
    try {
      await request(path, { ...command, commandId: replay.current.commandId });
      replay.current = null;
      setEditing(null);
      setNotice(`Measurement saved for ${title(row)}.`);
      try {
        setRows((await request<{ items: Row[] }>(path)).items);
      } catch {
        setProblem({ message: "The measurement was saved, but the list could not refresh.", reload: true });
      }
    } catch (error) {
      const stale = error instanceof MeasurementRequestError && error.message === "MEASUREMENT_VERSION_CONFLICT";
      setProblem(stale
        ? { message: "This measurement changed since you opened it. Your change was not saved.", reload: true }
        : { message: "The measurement could not be confirmed. Try confirming again." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <Card title="Measurements" sub="Work / Materials · Confirm a quantity for each scope item." id="work-measurements">
    {problem && <div className="card-body" role="alert"><Note tone="warning">{problem.message}
      {problem.reload && <div className="form-actions"><button type="button" className="btn small"
        onClick={() => window.location.reload()}>Reload measurements</button></div>}
    </Note></div>}
    {notice && <p className="card-body" role="status">{notice}</p>}
    {rows === undefined && !problem && <p className="card-body" role="status">Loading measurements…</p>}
    {rows?.length === 0 && <Empty title="No measurements yet" text="Add a scope item, then record its measurement."/>}
    {rows?.map(row => {
      const confirmed = row.status === "confirmed";
      const action = confirmed ? "Change measurement" : "Confirm measurement";
      return <article className="card-body form" key={row.scopeItemId}>
        <div>
          <h3>{title(row)}</h3>
          <p>{describe(row)}</p>
          <div className="job-caption"><Tag tone={confirmed ? "green" : "amber"}>{confirmed ? "Confirmed" : "Needs your answer"}</Tag></div>
          {!confirmed && <p>{question(row)}</p>}
        </div>
        {editing === row.scopeItemId && !problem?.reload
          ? <MeasurementForm row={row} busy={busy} save={(quantity, unit) => void save(row, quantity, unit)}
              cancel={() => { setEditing(null); setProblem(null); }}/>
          : <div><button type="button" className="btn small" aria-label={`${action} ${title(row)}`} disabled={busy || problem?.reload}
              onClick={() => { setEditing(row.scopeItemId); setNotice(""); setProblem(null); }}>{action}</button></div>}
      </article>;
    })}
  </Card>;
}
