"use client";

import { useEffect, useState } from "react";
import { certificateStorageKey, isCertificateTickValid, parseCertificateTicks, serialiseCertificateTicks,
  v2Certificates, V2_CERTIFICATES_TEMPLATE_KEY, type CertificateTick, type CertificateTicks } from "./v2-certificates";
import styles from "./practice-receipts.module.css";

export function V2CertificatesPanel({ jobId }: { jobId: string }) {
  // A different job must never inherit or save the previous job's in-memory ticks.
  return <CertificatesDraft key={jobId} jobId={jobId}/>;
}

function CertificatesDraft({ jobId }: { jobId: string }) {
  const [ticks, setTicks] = useState<CertificateTicks>({});
  const [loaded, setLoaded] = useState(false), [storageError, setStorageError] = useState("");
  useEffect(() => {
    try { setTicks(parseCertificateTicks(localStorage.getItem(certificateStorageKey(jobId)))); }
    catch { setStorageError("The saved list could not be read on this device. Check each item again."); }
    setLoaded(true);
  }, [jobId]);

  const change = (key: string, tick: CertificateTick) => {
    const next = { ...ticks, [key]: tick };
    setTicks(next);
    try {
      localStorage.setItem(certificateStorageKey(jobId), serialiseCertificateTicks(next));
      setStorageError("");
    } catch { setStorageError("Changes could not be saved on this device. Keep this page open and try again."); }
  };

  return <section className={styles.panel} aria-labelledby="v2-certificates-title" aria-busy={!loaded}>
    <h2 id="v2-certificates-title">Certificates and product records</h2>
    <p className={styles.warning}>Saved on this device only. The handover pack (coming later) keeps the final list</p>
    <p>You record what you have. JobGuard does not issue or verify certificates.</p>
    {storageError && <p role="alert">{storageError}</p>}
    {!loaded && <p>Loading this device's list…</p>}
    {(v2Certificates[V2_CERTIFICATES_TEMPLATE_KEY] ?? []).map(certificate => {
      const tick = ticks[certificate.key] ?? { status: "still_needed", reason: "" };
      const invalid = !isCertificateTickValid(tick);
      const fieldId = `certificate-${certificate.key}`;
      return <fieldset key={certificate.key} className={styles.movement} disabled={!loaded} style={{ minWidth: 0 }}>
        <legend>{certificate.label}</legend>
        <p>{certificate.when} {certificate.whoIssues}</p>
        <div className={styles.field}>
          <label htmlFor={fieldId}>Your record</label>
          <select id={fieldId} value={tick.status} onChange={event => change(certificate.key,
            { status: event.target.value as CertificateTick["status"], reason: "" })}>
            <option value="still_needed">Still needed</option>
            <option value="got_it">Got it</option>
            <option value="not_needed">Not needed</option>
          </select>
        </div>
        {tick.status === "not_needed" && <div className={styles.field}>
          <label htmlFor={`${fieldId}-reason`}>Why is it not needed? (up to 200 characters)</label>
          <textarea id={`${fieldId}-reason`} maxLength={200} value={tick.reason} required aria-invalid={invalid}
            aria-describedby={invalid ? `${fieldId}-error` : undefined}
            onChange={event => change(certificate.key, { status: "not_needed", reason: event.target.value })}/>
          {invalid && <p id={`${fieldId}-error`} role="alert">Add a reason. “Not needed” is not saved until you explain why.</p>}
        </div>}
      </fieldset>;
    })}
  </section>;
}
