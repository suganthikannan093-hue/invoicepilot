"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type Audit, type Modes } from "./components/api";
import SpendView from "./components/SpendView";
import BillView from "./components/BillView";

export default function Home() {
  const [tab, setTab] = useState<"spend" | "bill">("spend");
  const [modes, setModes] = useState<Modes>();
  const [audit, setAudit] = useState<Audit[]>([]);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean }>();
  const flash = useCallback((msg: string, bad = false) => { setToast({ msg, bad }); setTimeout(() => setToast(undefined), 4500); }, []);
  useEffect(() => { api<Modes>("/api/health").then(setModes); api<Audit[]>("/api/audit").then(setAudit); }, []);
  const isMockPP = modes?.paypal === "mock";

  return (<>
    <header>
      <div>
        <h1>SpendGuard</h1>
        <div className="sub">One guard for money an AI agent moves in both directions — spend, and get paid.</div>
      </div>
      <div className="grow" />
      {modes && <>
        <span className="badge" title="Language model">AI: {modes.llm === "openai" ? "OpenAI gpt-4o-mini" : "offline mock"}</span>
        <span className="badge" title="PayPal backend">PayPal: {isMockPP ? "MOCK (no sandbox creds)" : modes.paypal === "sandbox-agent-toolkit" ? "Sandbox · Agent Toolkit" : "Sandbox · REST"}</span>
      </>}
    </header>
    <div className="safety">🔒 The agent never holds PayPal credentials. Every PayPal write is checked against your policy and, when required, a single-use approval token bound to exactly what you saw.</div>
    {isMockPP && <div className="safety warn">⚠️ Mock PayPal mode: order and invoice IDs are simulated (ORD-MOCK-… / INV2-MOCK-…). Add PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET for the real sandbox.</div>}
    <nav className="tabs" aria-label="Direction">
      <button className={tab === "spend" ? "on" : ""} onClick={() => setTab("spend")}>Spend</button>
      <button className={tab === "bill" ? "on" : ""} onClick={() => setTab("bill")}>Bill</button>
    </nav>
    <main className={tab}>
      {tab === "spend"
        ? <SpendView modes={modes} audit={audit} onAudit={setAudit} flash={flash} />
        : <BillView modes={modes} audit={audit} onAudit={setAudit} flash={flash} />}
    </main>
    {toast && <div className={`toast ${toast.bad ? "bad" : ""}`}>{toast.msg}</div>}
  </>);
}
