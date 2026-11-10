"use client";
import type { Audit } from "./api";

export default function AuditPanel({ audit }: { audit: Audit[] }) {
  return (
    <section className="card">
      <h2>Unified audit log</h2>
      <p className="hint">Every spend and bill event: policy decisions, approvals, guard blocks and PayPal calls.</p>
      <div className="audit">
        {audit.length === 0 && <div className="muted">Nothing recorded yet.</div>}
        {audit.map((a, i) => (
          <div key={i}>
            <span className="muted">{new Date(a.at).toLocaleTimeString()}</span>
            {" · "}
            {a.direction && <span className={`dir ${a.direction}`}>{a.direction}</span>}
            {" · "}<b>{a.actor}</b> · {a.action}
            {a.detail ? <span className="muted"> · {a.detail}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
