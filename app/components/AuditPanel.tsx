"use client";
import { useState } from "react";
import { api, type Audit, type ChainVerify } from "./api";
import { shortHash } from "./ui";

export default function AuditPanel({ audit, onFlash }: { audit: Audit[]; onFlash: (msg: string, bad?: boolean) => void }) {
  const [verify, setVerify] = useState<ChainVerify>();
  const [busy, setBusy] = useState(false);

  const runVerify = async () => {
    setBusy(true);
    try {
      const v = await api<ChainVerify>("/api/audit/verify");
      setVerify(v);
      onFlash(v.ok ? `Audit chain verified · ${v.checked} event(s)` : `Chain broken: ${v.reason}`, !v.ok);
    } catch (e) {
      onFlash((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const exportLatest = async () => {
    setBusy(true);
    try {
      const r = await api<Record<string, unknown>>("/api/audit/receipt");
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "spendguard-audit-receipt.json";
      a.click();
      URL.revokeObjectURL(a.href);
      onFlash("Signed receipt downloaded");
    } catch (e) {
      onFlash((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <p className="kicker">Innovation · tamper-evident log</p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <h2>Hash-chained audit</h2>
        <div className="grow" />
        <button disabled={busy} onClick={runVerify}>{busy ? "Checking…" : "Verify chain"}</button>
        <button disabled={busy || audit.length === 0} onClick={exportLatest}>Export receipt</button>
      </div>
      <p className="hint">Every spend and bill decision is sealed to the previous event with SHA-256. Anyone can re-hash the log and see if a line was altered after the fact.</p>
      {verify && (
        <div className={verify.ok ? "chain-ok" : "chain-bad"}>
          {verify.ok
            ? <>Chain intact · {verify.checked} event(s) · head <span className="hash">{shortHash(verify.head)}</span></>
            : <>Chain failed{verify.reason ? ` · ${verify.reason}` : ""}</>}
        </div>
      )}
      <div className="audit">
        {audit.length === 0 && <div className="muted">Nothing recorded yet. Compile a policy or propose a purchase to start the chain.</div>}
        {audit.map((a, i) => (
          <div key={a.hash ?? `${a.at}-${i}`}>
            <span className="muted">{new Date(a.at).toLocaleTimeString()}</span>
            {" · "}
            {a.direction && <span className={`dir ${a.direction}`}>{a.direction}</span>}
            {" · "}<b>{a.actor}</b> · {a.action}
            {a.detail ? <span className="muted"> · {a.detail}</span> : null}
            {a.hash && <div className="muted hash">#{shortHash(a.hash)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
