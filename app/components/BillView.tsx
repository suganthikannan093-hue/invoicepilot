"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { computeTotals, money } from "@/lib/totals";
import { InvoiceDraftSchema, CURRENCIES, type InvoiceDraft } from "@/lib/schema";
import { api, type Audit, type Modes } from "./api";
import AuditPanel from "./AuditPanel";

type Action = "create" | "send" | "remind";
type Rec = {
  id: string; prompt: string; draft: InvoiceDraft; assumptions: string[]; source: string; status: string;
  paypal?: { invoiceId: string; status: string; mode: string; payerViewUrl?: string; lastCheckedAt?: string };
  reminder?: { subject: string; note: string; source: string }; remindersSent: number; createdAt: string;
  issues: string[]; hashes: Record<Action, string>;
};

const EXAMPLES = [
  "Invoice Acme Robotics (billing@acme-robotics.com) for 12 hours of React dashboard work at $95/hour plus a logo refresh for $400. 8% tax, net 15.",
  "Bill Priya Shah, priya@studiokite.in, for the wedding photo shoot ₹45000 and album design ₹12000, 18% GST, due in 10 days.",
  "Send Lena Fischer (lena@nordbau.de) an invoice: website copywriting €650 and 3 hours of SEO consulting at €80 per hour. Due end of next week.",
];

export default function BillView({ modes, audit, onAudit, flash }: {
  modes?: Modes;
  audit: Audit[];
  onAudit: (a: Audit[]) => void;
  flash: (msg: string, bad?: boolean) => void;
}) {
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [selId, setSelId] = useState<string>();
  const [edit, setEdit] = useState<InvoiceDraft>();
  const [busy, setBusy] = useState<string>();
  const [confirm, setConfirm] = useState<{ action: Action; rec: Rec }>();
  const [rem, setRem] = useState<{ subject: string; note: string }>();
  const [importId, setImportId] = useState("");
  const [scan, setScan] = useState<{ scannedAt: string; results: { id: string; invoiceId?: string; client: string; status: string; daysToDue: number; bucket: string; action: string }[] }>();
  const [live, setLive] = useState(true);

  const sel = recs.find((r) => r.id === selId);
  const load = useCallback(async () => {
    const [l, a] = await Promise.all([api<Rec[]>("/api/drafts"), api<Audit[]>("/api/audit")]);
    setRecs(l); onAudit(a);
  }, [onAudit]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setEdit(sel?.status === "DRAFTED" ? structuredClone(sel.draft) : undefined); setRem(sel?.reminder ? { ...sel.reminder } : undefined); }, [selId, sel?.status, sel?.reminder?.note]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      const open = recs.filter((r) => r.paypal && r.status === "SENT");
      for (const r of open) { try { const x = await api<Rec>(`/api/drafts/${r.id}/status`, { method: "POST", json: {} }); if (x.status === "PAID") { flash(`Paid! ${x.draft.clientName} paid ${x.paypal?.invoiceId}`); load(); } } catch { /* next tick */ } }
    }, 20000);
    return () => clearInterval(t);
  }, [live, recs, load, flash]);
  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sum = (f: (r: Rec) => boolean) => { const by: Record<string, number> = {}; let n = 0; for (const r of recs.filter(f)) { n++; by[r.draft.currency] = (by[r.draft.currency] ?? 0) + computeTotals(r.draft).total; } return { n, txt: Object.entries(by).map(([c, v]) => `${c} ${money(v, c as InvoiceDraft["currency"])}`).join(" + ") || "—"}; };
    return { out: sum((r) => r.status === "SENT"), over: sum((r) => r.status === "SENT" && r.draft.dueDate < today), paid: sum((r) => r.status === "PAID"), draft: sum((r) => r.status === "DRAFTED" || r.status === "CREATED") };
  }, [recs]);
  const upsert = (r: Rec) => { setRecs((xs) => [r, ...xs.filter((x) => x.id !== r.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))); setSelId(r.id); api<Audit[]>("/api/audit").then(onAudit); };
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); try { await fn(); } catch (e) { flash((e as Error).message, true); load(); } finally { setBusy(undefined); } };

  const generate = () => run("gen", async () => { const r = await api<Rec>("/api/drafts", { method: "POST", json: { prompt } }); upsert(r); flash(r.source === "openai" ? "Draft ready: review it below" : "Draft ready (offline mock parser)"); });

  const validation = useMemo(() => (edit ? InvoiceDraftSchema.safeParse(edit) : undefined), [edit]);
  const fieldErr = (p: string) => validation && !validation.success && validation.error.issues.some((i) => i.path.join(".") === p);
  const totals = edit ? computeTotals(edit) : sel ? computeTotals(sel.draft) : undefined;
  const dirty = !!(edit && sel && JSON.stringify(edit) !== JSON.stringify(sel.draft));

  const save = async () => { if (!sel || !edit) return sel; const r = await api<Rec>(`/api/drafts/${sel.id}`, { method: "PATCH", json: { draft: edit } }); upsert(r); return r; };
  const saveRem = async () => { if (!sel || !rem) return sel; const r = await api<Rec>(`/api/drafts/${sel.id}/reminder`, { method: "PATCH", json: rem }); upsert(r); return r; };

  const ask = (action: Action) => run("prep", async () => { const r = action === "create" ? await save() : action === "remind" ? await saveRem() : sel; if (r) setConfirm({ action, rec: r }); });
  const doApproved = () => confirm && run("exec", async () => {
    const { action, rec } = confirm;
    const { token } = await api<{ token: string }>(`/api/drafts/${rec.id}/approve`, { method: "POST", json: { action, contentHash: rec.hashes[action], confirm: true } });
    const r = await api<Rec>(`/api/drafts/${rec.id}/execute`, { method: "POST", json: { action }, token });
    setConfirm(undefined); upsert(r);
    flash(action === "create" ? `PayPal invoice ${r.paypal?.invoiceId} created (${r.paypal?.status})` : action === "send" ? "Invoice sent to the client via PayPal" : "Reminder sent via PayPal");
  });

  const setItem = (i: number, k: string, v: string | number) => setEdit((d) => d && { ...d, items: d.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });
  const isMockPP = modes?.paypal === "mock";
  const step = !sel ? 0 : sel.status === "DRAFTED" ? 1 : sel.status === "CREATED" ? 2 : sel.status === "SENT" ? 3 : 4;

  return (<>
    <div className="stack">
      <section className="card">
        <h2>Bill · the same guard, the other direction</h2>
        <p className="hint">Invoices still need a single-use approval token. They are also checked against the same policy file (invoice cap) and land in the same audit log.</p>
      </section>
      <section className="card">
        <h2>1 · Describe the work</h2>
        <p className="hint">Plain English is fine: client, email, hours or fees, tax, payment terms.</p>
        <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Describe the work" />
        <div className="chips">{EXAMPLES.map((e, i) => <span key={i} className="chip" onClick={() => setPrompt(e)}>Example {i + 1}</span>)}</div>
        <div className="actions"><button className="primary" disabled={!!busy || !prompt.trim()} onClick={generate}>{busy === "gen" ? "Drafting…" : "✨ Draft invoice"}</button></div>
      </section>

      {sel && (<section className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2>2 · Review {sel.status === "DRAFTED" ? "& edit" : ""}</h2><span className={`status ${sel.status}`}>{sel.status}</span>
          <span className={`badge ${sel.source === "mock" ? "mock" : ""}`}>{sel.prompt.startsWith("Imported from PayPal") ? "imported from PayPal" : `drafted by ${sel.source === "openai" ? "gpt-4o-mini" : "mock parser"}`}</span>
        </div>
        <div className="steps">{["Draft", "Approve → PayPal draft", "Confirm → Send", "Collect"].map((s, i) => <span key={s} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""}>{i + 1}. {s}</span>)}</div>
        <p className="hint muted small">“{sel.prompt}”</p>
        {sel.assumptions.length > 0 && sel.status === "DRAFTED" && <div className="assume">🤔 <b>Agent assumptions, please check:</b><ul>{sel.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
        {(() => { const d = edit ?? sel.draft; const ro = !edit; return (<>
          <div className="row r2">
            <div><label>Client name</label><input disabled={ro} className={fieldErr("clientName") ? "err" : ""} value={d.clientName} onChange={(e) => setEdit({ ...d, clientName: e.target.value })} /></div>
            <div><label>Client email</label><input disabled={ro} className={fieldErr("clientEmail") ? "err" : ""} value={d.clientEmail} onChange={(e) => setEdit({ ...d, clientEmail: e.target.value })} /></div>
          </div>
          <div className="row r4" style={{ marginTop: 10 }}>
            <div><label>Currency</label><select disabled={ro} value={d.currency} onChange={(e) => setEdit({ ...d, currency: e.target.value as InvoiceDraft["currency"] })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label>Tax %</label><input disabled={ro} type="number" min={0} max={100} step="0.01" className={fieldErr("taxPercent") ? "err" : ""} value={d.taxPercent} onChange={(e) => setEdit({ ...d, taxPercent: +e.target.value })} /></div>
            <div><label>Due date</label><input disabled={ro} type="date" className={fieldErr("dueDate") ? "err" : ""} value={d.dueDate} onChange={(e) => setEdit({ ...d, dueDate: e.target.value })} /></div>
            <div><label>Invoice ID</label><input disabled value={sel.paypal?.invoiceId ?? "assigned on approval"} /></div>
          </div>
          <table style={{ marginTop: 12 }}><thead><tr><th style={{ width: "34%" }}>Item</th><th>Description</th><th className="num" style={{ width: 70 }}>Qty</th><th style={{ width: 100 }}>Unit</th><th className="num" style={{ width: 100 }}>Price</th><th className="num" style={{ width: 90 }}>Amount</th>{!ro && <th />}</tr></thead>
            <tbody>{d.items.map((it, i) => <tr key={i}>
              <td><input disabled={ro} className={fieldErr(`items.${i}.name`) ? "err" : ""} value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} /></td>
              <td><input disabled={ro} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} /></td>
              <td><input disabled={ro} type="number" step="0.25" className={fieldErr(`items.${i}.quantity`) ? "err" : ""} value={it.quantity} onChange={(e) => setItem(i, "quantity", +e.target.value)} /></td>
              <td><select disabled={ro} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)}><option>HOURS</option><option>QUANTITY</option><option>AMOUNT</option></select></td>
              <td><input disabled={ro} type="number" step="0.01" className={fieldErr(`items.${i}.unitPrice`) ? "err" : ""} value={it.unitPrice} onChange={(e) => setItem(i, "unitPrice", +e.target.value)} /></td>
              <td className="num">{money(totals!.lines[i] ?? 0, d.currency)}</td>
              {!ro && <td><button className="link danger" title="Remove" onClick={() => setEdit({ ...d, items: d.items.filter((_, j) => j !== i) })}>✕</button></td>}
            </tr>)}</tbody></table>
          {!ro && <button className="link" onClick={() => setEdit({ ...d, items: [...d.items, { name: "", description: "", quantity: 1, unitPrice: 0, unit: "QUANTITY" }] })}>+ Add line item</button>}
          <div style={{ marginTop: 10 }}><label>Note to client</label><textarea disabled={ro} rows={2} value={d.notes} onChange={(e) => setEdit({ ...d, notes: e.target.value })} /></div>
          <div className="tot">
            <div><span>Subtotal</span><span>{d.currency} {money(totals!.subtotal, d.currency)}</span></div>
            <div><span>Tax ({d.taxPercent}%)</span><span>{d.currency} {money(totals!.tax, d.currency)}</span></div>
            <div className="grand"><span>Total</span><span>{d.currency} {money(totals!.total, d.currency)}</span></div>
          </div>
          {validation && !validation.success && <div className="issues">Fix before approving:<ul>{validation.error.issues.map((i, k) => <li key={k}>{i.path.join(".")}: {i.message}</li>)}</ul></div>}
        </>); })()}

        {sel.status === "DRAFTED" && <div className="actions">
          {dirty && <span className="small muted">Unsaved edits are saved when you approve</span>}
          <button className="approve" disabled={!!busy || !validation?.success} onClick={() => ask("create")}>✅ Approve &amp; create PayPal draft</button>
        </div>}

        {sel.paypal && <div className="result">
          <b>PayPal invoice</b> <span className="mono">{sel.paypal.invoiceId}</span> · status <span className={`status ${sel.paypal.status}`}>{sel.paypal.status}</span> <span className="small muted">({sel.paypal.mode})</span>
          {sel.paypal.payerViewUrl && <> · <a href={sel.paypal.payerViewUrl} target="_blank">payer view ↗</a></>}
          <div className="actions">
            <button disabled={!!busy} onClick={() => run("st", async () => upsert(await api<Rec>(`/api/drafts/${sel.id}/status`, { method: "POST", json: {} })))}>↻ Check status</button>
            {sel.status === "CREATED" && <button className="approve" disabled={!!busy} onClick={() => ask("send")}>📨 Confirm &amp; send to client</button>}
            {sel.status === "SENT" && !sel.reminder && <button className="primary" disabled={!!busy} onClick={() => run("rem", async () => upsert(await api<Rec>(`/api/drafts/${sel.id}/reminder`, { method: "POST", json: {} })))}>{busy === "rem" ? "Drafting…" : "✍️ Draft reminder"}</button>}
          </div>
        </div>}

        {sel.status === "SENT" && sel.reminder && rem && <div className="result" style={{ background: "#fffaf0", borderColor: "#ffe0a3" }}>
          <b>3 · Reminder draft</b> <span className="badge">by {sel.reminder.source === "openai" ? "gpt-4o-mini" : "mock"}</span> <span className="small muted">reminders sent so far: {sel.remindersSent}</span>
          <div style={{ marginTop: 8 }}><label>Subject</label><input value={rem.subject} onChange={(e) => setRem({ ...rem, subject: e.target.value })} /></div>
          <div style={{ marginTop: 8 }}><label>Message</label><textarea rows={5} value={rem.note} onChange={(e) => setRem({ ...rem, note: e.target.value })} /></div>
          <div className="actions">
            <button onClick={() => run("rem", async () => upsert(await api<Rec>(`/api/drafts/${sel.id}/reminder`, { method: "POST", json: {} })))} disabled={!!busy}>↻ Redraft</button>
            <button className="approve" disabled={!!busy || !rem.subject.trim() || !rem.note.trim()} onClick={() => ask("remind")}>✅ Approve &amp; send reminder</button>
          </div>
        </div>}
      </section>)}
    </div>

    <div className="stack">
      <section className="card">
        <h2>Cash-flow dashboard</h2>
        <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {([["Outstanding", kpi.out, "#0070e0"], ["Overdue", kpi.over, "#c0392b"], ["Paid", kpi.paid, "#1a8f4a"], ["Drafts", kpi.draft, "#666"]] as const).map(([l, k, c]) => (
            <div key={l} style={{ border: "1px solid #e3e8ef", borderRadius: 10, padding: "8px 10px" }}><div className="small muted">{l} · {k.n}</div><b style={{ color: c }}>{k.txt}</b></div>))}
        </div>
        <div className="actions" style={{ flexWrap: "wrap" }}>
          <button className="primary" disabled={!!busy} onClick={() => run("scan", async () => { const s = await api<NonNullable<typeof scan>>("/api/collections", { method: "POST", json: {} }); setScan(s); await load(); flash(`Collections agent checked ${s.results.length} invoice(s)`); })}>{busy === "scan" ? "Scanning PayPal…" : "🤖 Run collections agent"}</button>
          <label className="small"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live PayPal status (20s)</label>
        </div>
        {scan && <div className="audit" style={{ marginTop: 6 }}>{scan.results.length === 0 ? <div className="muted">No open invoices.</div> : scan.results.map((r) => (
          <div key={r.id} onClick={() => setSelId(r.id)} style={{ cursor: "pointer" }}><b>{r.client}</b> · <span className="mono">{r.invoiceId}</span> · {r.status} · <b>{r.bucket}</b> ({r.daysToDue >= 0 ? `due in ${r.daysToDue}d` : `${-r.daysToDue}d late`}) → <i>{r.action}</i></div>))}</div>}
        <div className="actions">
          <input aria-label="PayPal invoice ID" placeholder="Import a PayPal invoice: INV2-…" value={importId} onChange={(e) => setImportId(e.target.value)} style={{ flex: 1 }} />
          <button disabled={!!busy || !importId.trim()} onClick={() => run("imp", async () => { const r = await api<Rec>("/api/import", { method: "POST", json: { invoiceId: importId } }); upsert(r); setImportId(""); flash(`Imported ${r.paypal?.invoiceId} (${r.paypal?.status})`); })}>⤓ Import</button>
        </div>
      </section>
      <section className="card">
        <div style={{ display: "flex", alignItems: "center" }}><h2>Invoices</h2><div className="grow" />
          <button className="link" disabled={!!busy} onClick={() => run("all", async () => { for (const r of recs.filter((x) => x.paypal && x.status !== "PAID")) await api(`/api/drafts/${r.id}/status`, { method: "POST", json: {} }); await load(); flash("Statuses refreshed from PayPal"); })}>↻ Refresh all</button></div>
        <p className="hint">Click one to review. Statuses come from PayPal.</p>
        {recs.length === 0 && <p className="muted">No invoices yet: draft one on the left.</p>}
        {recs.map((r) => { const t = computeTotals(r.draft); return (
          <div key={r.id} className={`inv ${r.id === selId ? "sel" : ""}`} onClick={() => setSelId(r.id)} style={{ cursor: "pointer" }}>
            <div className="top"><b>{r.draft.clientName || "(no client)"}</b><span className={`status ${r.status}`}>{r.status}</span><span className="amt">{r.draft.currency} {money(t.total, r.draft.currency)}</span></div>
            <div className="small muted">{r.paypal ? <span className="mono">{r.paypal.invoiceId}</span> : "not in PayPal yet"} · due {r.draft.dueDate}{r.remindersSent ? ` · ${r.remindersSent} reminder(s)` : ""}</div>
          </div>); })}
      </section>
      <AuditPanel audit={audit} />
    </div>

    {confirm && <div className="modal-bg" onClick={() => !busy && setConfirm(undefined)}><div className="modal" onClick={(e) => e.stopPropagation()}>
      <h3>{confirm.action === "create" ? "Create this invoice in PayPal?" : confirm.action === "send" ? "Send this invoice to the client?" : "Send this reminder via PayPal?"}</h3>
      <p className="muted small">{confirm.action === "create" ? "PayPal will create a DRAFT invoice. Nothing is emailed to the client yet; that's a separate confirm." : confirm.action === "send" ? "PayPal will email the client a payable invoice." : "PayPal will email this reminder to the client."}{isMockPP ? " (Mock PayPal mode: simulated.)" : " (PayPal sandbox.)"}</p>
      <div className="kv">
        <span className="muted">Client</span><span>{confirm.rec.draft.clientName} &lt;{confirm.rec.draft.clientEmail}&gt;</span>
        <span className="muted">Total</span><b>{confirm.rec.draft.currency} {money(computeTotals(confirm.rec.draft).total, confirm.rec.draft.currency)}</b>
        <span className="muted">Due</span><span>{confirm.rec.draft.dueDate}</span>
        {confirm.action === "remind" && <><span className="muted">Subject</span><span>{confirm.rec.reminder?.subject}</span></>}
        {confirm.rec.paypal && <><span className="muted">Invoice</span><span className="mono">{confirm.rec.paypal.invoiceId}</span></>}
      </div>
      <div className="actions"><button disabled={!!busy} onClick={() => setConfirm(undefined)}>Cancel</button>
        <button className="approve" disabled={!!busy} onClick={doApproved}>{busy === "exec" ? "Working…" : "Yes, I approve"}</button></div>
    </div></div>}
  </>);
}
