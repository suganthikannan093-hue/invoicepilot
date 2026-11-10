"use client";
import { useState } from "react";
import { api, type PolicyView, type SimulateResult } from "./api";

export default function PolicyChrome({
  policy, policyText, setPolicyText, onCompiled, flash, busy, setBusy,
}: {
  policy?: PolicyView;
  policyText: string;
  setPolicyText: (t: string) => void;
  onCompiled: (p: PolicyView) => void;
  flash: (msg: string, bad?: boolean) => void;
  busy?: string;
  setBusy: (s: string | undefined) => void;
}) {
  const [sim, setSim] = useState<SimulateResult>();

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { flash((e as Error).message, true); }
    finally { setBusy(undefined); }
  };

  const compile = () => run("compile", async () => {
    const pol = await api<PolicyView>("/api/policy", { method: "PUT", json: { plainEnglish: policyText } });
    setSim(undefined);
    onCompiled(pol);
    flash(pol.source === "openai" ? "Policy compiled into rules" : "Policy compiled (offline mock compiler)");
  });

  const dryRun = () => run("simulate", async () => {
    const r = await api<SimulateResult>("/api/policy/simulate", { method: "POST", json: { plainEnglish: policyText } });
    setSim(r);
    flash("Dry-run only — the saved policy was not changed");
  });

  const used = policy ? (policy.budget.dailyCap === 0 ? 100 : (policy.budget.dailySpent / policy.budget.dailyCap) * 100) : 0;

  return (
    <div className="chrome">
      <section className="card">
        <p className="kicker">One policy · both directions</p>
        <h2>Plain-English rules</h2>
        <p className="hint">The agent compiles this into structured checks on the server, before any PayPal order or invoice exists. A dry-run shows what the rule would decide without saving it.</p>
        <textarea rows={6} value={policyText} onChange={(e) => setPolicyText(e.target.value)} aria-label="Spending and billing policy" />
        <div className="actions">
          <button disabled={!!busy || !policyText.trim()} onClick={dryRun}>{busy === "simulate" ? "Simulating…" : "Dry-run this rule"}</button>
          <button className="primary" disabled={!!busy || !policyText.trim()} onClick={compile}>{busy === "compile" ? "Compiling…" : "Compile & save"}</button>
        </div>
        {sim && (
          <div style={{ marginTop: 12 }}>
            <p className="kicker">Innovation · policy dry-run</p>
            <p className="small muted" style={{ margin: "0 0 8px" }}>Compiled with the {sim.source === "openai" ? "gpt-4o-mini" : "mock"} compiler. Not saved. Daily cap would be {sim.policy.currency} {sim.policy.dailyCap}.</p>
            {sim.results.map((r, i) => (
              <div className="sim-row" key={i}>
                <div>
                  <b>{r.sample.label}</b>
                  <div className="small muted">{r.sample.currency} {r.sample.amount} · {r.sample.merchant}{r.injection.detected ? " · injection detected" : ""}</div>
                </div>
                <span className={`status ${r.decision.outcome}`}>{r.decision.outcome.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        )}
        {policy && !sim && (
          <div className="compiled">
            <div className="compiled-head">
              <b>Compiled rules</b>
              <span className={`badge ${policy.source === "mock" ? "mock" : ""}`}>{policy.source === "openai" ? "gpt-4o-mini" : "mock compiler"}</span>
            </div>
            <pre>{JSON.stringify(policy.compiled, null, 2)}</pre>
          </div>
        )}
      </section>
      <section className="card budget">
        <p className="kicker">Today</p>
        <h2>Budget meter</h2>
        {policy ? (
          <>
            <p className="hint">{policy.budget.today} · {policy.budget.currency} · invoices share this same policy file</p>
            <div className="budget-row">
              <b>{policy.budget.currency} {policy.budget.dailyRemaining.toFixed(2)}</b>
              <span className="muted" style={{ fontSize: 14, fontFamily: "var(--sans)" }}>left of {policy.budget.currency} {policy.budget.dailyCap.toFixed(2)}</span>
            </div>
            <div className="meter" aria-label="Budget used"><span style={{ width: `${Math.min(100, used)}%` }} /></div>
            <div className="small muted" style={{ marginTop: 8 }}>Spent today: {policy.budget.currency} {policy.budget.dailySpent.toFixed(2)}</div>
            <div className="small muted">Approval over {policy.compiled.currency} {policy.compiled.approvalThreshold} · invoice cap {policy.compiled.currency} {policy.compiled.bill.maxInvoiceAmount.toLocaleString()}</div>
          </>
        ) : (
          <p className="muted">Loading the default policy…</p>
        )}
      </section>
    </div>
  );
}
