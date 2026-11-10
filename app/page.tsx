"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type Audit, type Modes, type PolicyView } from "./components/api";
import SpendView from "./components/SpendView";
import BillView from "./components/BillView";
import PolicyChrome from "./components/PolicyChrome";
import AuditPanel from "./components/AuditPanel";

export default function Home() {
  const [tab, setTab] = useState<"spend" | "bill">("spend");
  const [modes, setModes] = useState<Modes>();
  const [audit, setAudit] = useState<Audit[]>([]);
  const [policy, setPolicy] = useState<PolicyView>();
  const [policyText, setPolicyText] = useState("");
  const [busy, setBusy] = useState<string>();
  const [toast, setToast] = useState<{ msg: string; bad?: boolean }>();
  const flash = useCallback((msg: string, bad = false) => { setToast({ msg, bad }); setTimeout(() => setToast(undefined), 4500); }, []);

  const refreshChrome = useCallback(async () => {
    const [m, a, pol] = await Promise.all([
      api<Modes>("/api/health"),
      api<Audit[]>("/api/audit"),
      api<PolicyView>("/api/policy"),
    ]);
    setModes(m);
    setAudit(a);
    setPolicy(pol);
    setPolicyText((t) => t || pol.plainEnglish);
  }, []);

  useEffect(() => { refreshChrome(); }, [refreshChrome]);

  const onCompiled = useCallback(async (p: PolicyView) => {
    setPolicy(p);
    setAudit(await api<Audit[]>("/api/audit"));
  }, []);

  const isMockPP = modes?.paypal === "mock";
  const storeLabel = modes?.store === "redis" ? "Upstash Redis" : modes?.store === "file" ? "file store" : "store…";

  return (<>
    <header className="appbar">
      <div className="mark">
        <h1>SpendGuard</h1>
        <div className="sub">One guard for money an AI agent moves in both directions — spend, and get paid. Approvals are single-use, 10-minute, and bound to the exact order.</div>
      </div>
      <div className="grow" />
      {modes && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span className="badge" title="Language model">AI: {modes.llm === "openai" ? "OpenAI gpt-4o-mini" : "offline mock"}</span>
        <span className="badge" title="PayPal backend">PayPal: {isMockPP ? "MOCK (no sandbox creds)" : modes.paypal === "sandbox-agent-toolkit" ? "Sandbox · Agent Toolkit" : "Sandbox · REST"}</span>
        <span className="badge" title="Durable store">{storeLabel}</span>
      </div>}
    </header>
    <div className="safety">The agent never holds PayPal credentials. Every PayPal write is checked against your policy and, when required, a single-use approval token bound to exactly what you saw.</div>
    {isMockPP && <div className="safety warn">Mock PayPal mode: order and invoice IDs are simulated (ORD-MOCK-… / INV2-MOCK-…). Add PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET for the real sandbox.</div>}

    <div className="shell">
      <PolicyChrome
        policy={policy}
        policyText={policyText}
        setPolicyText={setPolicyText}
        onCompiled={onCompiled}
        flash={flash}
        busy={busy}
        setBusy={setBusy}
      />
      <nav className="tabs" aria-label="Direction">
        <button className={tab === "spend" ? "on" : ""} onClick={() => setTab("spend")}>Spend<span className="tab-sub">Money out</span></button>
        <button className={tab === "bill" ? "on" : ""} onClick={() => setTab("bill")}>Bill<span className="tab-sub">Money in</span></button>
      </nav>
      <main className="stage">
        {tab === "spend"
          ? <SpendView modes={modes} onAudit={setAudit} flash={flash} onPolicy={setPolicy} busy={busy} setBusy={setBusy} />
          : <BillView modes={modes} onAudit={setAudit} flash={flash} busy={busy} setBusy={setBusy} />}
      </main>
      <AuditPanel audit={audit} onFlash={flash} />
    </div>
    {toast && <div className={`toast ${toast.bad ? "bad" : ""}`}>{toast.msg}</div>}
  </>);
}
