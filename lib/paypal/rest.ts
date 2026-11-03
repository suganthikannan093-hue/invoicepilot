import type { PayPalGateway, PayPalInvoiceRef } from "./types";

export const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
let cache: { token: string; exp: number } | null = null;

/** OAuth2 client-credentials token, cached until 60s before expiry. Secrets are never logged. */
export async function getAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (cache && cache.exp > Date.now()) return cache.token;
  const id = process.env.PAYPAL_CLIENT_ID!, secret = process.env.PAYPAL_CLIENT_SECRET!;
  const res = await fetchImpl(`${SANDBOX_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}
export const _resetTokenCache = () => { cache = null; };

async function call<T>(method: string, path: string, body?: unknown, requestId?: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${SANDBOX_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const e = JSON.parse(text); msg = `${e.name ?? ""} ${e.message ?? ""} ${(e.details ?? []).map((d: { issue?: string; description?: string }) => d.issue + ": " + d.description).join("; ")}`; } catch {}
    throw new Error(`PayPal ${method} ${path} → ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

type Inv = { id: string; status: string; detail?: { metadata?: { recipient_view_url?: string } }; href?: string };
const ref = (i: Inv): PayPalInvoiceRef => ({ invoiceId: i.id, status: i.status, payerViewUrl: i.detail?.metadata?.recipient_view_url });

export const restGateway: PayPalGateway = {
  mode: "sandbox-rest",
  async createDraft(body) {
    const r = await call<Inv & { href?: string }>("POST", "/v2/invoicing/invoices", body, crypto.randomUUID());
    if (r.id) return ref(r);
    const id = r.href?.split("/").pop();
    return this.getStatus(id!);
  },
  async send(id) {
    await call("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, { send_to_invoicer: true }, crypto.randomUUID());
    return this.getStatus(id);
  },
  async getStatus(id) { return ref(await call<Inv>("GET", `/v2/invoicing/invoices/${encodeURIComponent(id)}`)); },
  async remind(id, subject, note) {
    await call("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`, { subject, note, send_to_invoicer: true }, crypto.randomUUID());
  },
};
