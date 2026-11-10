"use client";
import type { ReactNode } from "react";

export function TokenNote({ extra }: { extra?: string }) {
  return (
    <p className="token-note">
      This approval is <b>single-use</b>, expires in <b>10 minutes</b>, and is bound to this exact item, merchant, and amount.
      A capture without a token, or with a token for a different order, returns <b>403</b>.
      {extra ? ` ${extra}` : ""}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <div className="small">{children}</div>
    </div>
  );
}

export function ApprovalModal({
  title, hint, busy, onCancel, onConfirm, children,
}: {
  title: string; hint: string; busy?: boolean; onCancel: () => void; onConfirm: () => void; children: ReactNode;
}) {
  return (
    <div className="modal-bg" onClick={() => !busy && onCancel()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted small">{hint}</p>
        <div className="kv">{children}</div>
        <TokenNote />
        <div className="actions">
          <button disabled={!!busy} onClick={onCancel}>Cancel</button>
          <button className="approve" disabled={!!busy} onClick={onConfirm}>{busy ? "Working…" : "Yes, I approve"}</button>
        </div>
      </div>
    </div>
  );
}

export function shortHash(h?: string) {
  if (!h) return "—";
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}
