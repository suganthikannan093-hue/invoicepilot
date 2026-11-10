import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { money } from "../totals";
import { getAccessToken, SANDBOX_BASE } from "./rest";

export interface PayPalOrderRef {
  orderId: string;
  status: string;
  approveUrl?: string;
  captureId?: string;
}

export interface CreateOrderInput {
  amount: number;
  currency: string;
  item: string;
  merchant?: string;
  customId?: string;
  intent?: "CAPTURE" | "AUTHORIZE";
}

export interface OrdersGateway {
  mode: "mock" | "sandbox-rest" | "sandbox-agent-toolkit";
  create(input: CreateOrderInput): Promise<PayPalOrderRef>;
  get(orderId: string): Promise<PayPalOrderRef>;
  authorize(orderId: string): Promise<PayPalOrderRef>;
  capture(orderId: string): Promise<PayPalOrderRef>;
}

type OrderBody = {
  id?: string;
  status?: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { payments?: { captures?: { id?: string }[]; authorizations?: { id?: string }[] } }[];
};

function refFrom(order: OrderBody, fallbackId?: string): PayPalOrderRef {
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  const approve = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  return {
    orderId: order.id ?? fallbackId ?? "",
    status: order.status ?? "CREATED",
    approveUrl: approve,
    captureId: captures[0]?.id,
  };
}

type MockOrder = { status: string; intent: string; authorizeUrl?: string };
const mockOrders = new Map<string, MockOrder>();

export const mockOrdersGateway: OrdersGateway = {
  mode: "mock",
  async create(input) {
    const orderId = "ORD-MOCK-" + Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Date.now().toString(36).toUpperCase().slice(-4);
    mockOrders.set(orderId, { status: "CREATED", intent: input.intent ?? "CAPTURE" });
    return { orderId, status: "CREATED", approveUrl: undefined };
  },
  async get(orderId) {
    const m = mockOrders.get(orderId);
    return { orderId, status: m?.status ?? "CREATED" };
  },
  async authorize(orderId) {
    const m = mockOrders.get(orderId) ?? { status: "CREATED", intent: "AUTHORIZE" };
    m.status = "AUTHORIZING";
    mockOrders.set(orderId, { ...m, status: "AUTHORIZING" });
    // Mock: payer is implicit; jump to APPROVED then we treat authorize as success.
    mockOrders.set(orderId, { status: "APPROVED", intent: m.intent });
    return { orderId, status: "APPROVED" };
  },
  async capture(orderId) {
    mockOrders.set(orderId, { status: "COMPLETED", intent: mockOrders.get(orderId)?.intent ?? "CAPTURE" });
    return { orderId, status: "COMPLETED", captureId: "CAP-MOCK-" + orderId.slice(-6) };
  },
};

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

function createBody(input: CreateOrderInput) {
  const value = money(input.amount, input.currency);
  const desc = (input.item || "SpendGuard purchase").slice(0, 127);
  return {
    intent: input.intent ?? "CAPTURE",
    purchase_units: [{
      description: desc,
      custom_id: (input.customId ?? "").slice(0, 127) || undefined,
      soft_descriptor: "SPENDGUARD",
      amount: {
        currency_code: input.currency,
        value,
        breakdown: { item_total: { currency_code: input.currency, value } },
      },
      items: [{
        name: desc,
        quantity: "1",
        category: "DIGITAL_GOODS",
        unit_amount: { currency_code: input.currency, value },
      }],
    }],
    application_context: {
      brand_name: "SpendGuard",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
      return_url: process.env.SPENDGUARD_PUBLIC_URL ? `${process.env.SPENDGUARD_PUBLIC_URL}/spend/return` : "https://example.com/spendguard/return",
      cancel_url: process.env.SPENDGUARD_PUBLIC_URL ? `${process.env.SPENDGUARD_PUBLIC_URL}/spend/cancel` : "https://example.com/spendguard/cancel",
    },
  };
}

export const restOrdersGateway: OrdersGateway = {
  mode: "sandbox-rest",
  async create(input) {
    const order = await call<OrderBody>("POST", "/v2/checkout/orders", createBody(input), crypto.randomUUID());
    return refFrom(order);
  },
  async get(orderId) { return refFrom(await call<OrderBody>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`), orderId); },
  async authorize(orderId) {
    const order = await call<OrderBody>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {}, crypto.randomUUID());
    return refFrom(order, orderId);
  },
  async capture(orderId) {
    const order = await call<OrderBody>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, crypto.randomUUID());
    return refFrom(order, orderId);
  },
};

let tk: PayPalAgentToolkit | null = null;
const toolkit = () => (tk ??= new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!, clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: { actions: { orders: { create: true, get: true, capture: true } }, context: { sandbox: true } },
}));

async function run(name: string, args: Record<string, unknown>): Promise<unknown> {
  const out = await toolkit().handleToolCall({ id: "call_" + crypto.randomUUID(), type: "function", function: { name, arguments: JSON.stringify(args) } } as never);
  const c = typeof out.content === "string" ? out.content : JSON.stringify(out.content);
  try { return JSON.parse(c); } catch { return c; }
}

const ORDER_OK = new Set(["CREATED", "SAVED", "APPROVED", "PAYER_ACTION_REQUIRED", "COMPLETED", "VOIDED", "AUTHORIZING", "CAPTURED"]);

function unwrapOrder(out: unknown, fallbackId?: string): PayPalOrderRef {
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    const httpStatus = typeof o.status === "number" ? o.status : undefined;
    if (o.ok === false || o.status === "error" || (httpStatus !== undefined && httpStatus >= 400)) {
      const msg = typeof o.message === "string" ? o.message : JSON.stringify(o.response ?? o).slice(0, 240);
      throw new Error(`PayPal Agent Toolkit order error (${httpStatus ?? o.code ?? "error"}): ${msg}`);
    }
    // pay_order wraps as { status: "success", response: {...} }
    const inner = (o.response && typeof o.response === "object") ? o.response as OrderBody : o as OrderBody;
    if (inner.id || (inner.status && ORDER_OK.has(String(inner.status)))) return refFrom(inner, fallbackId);
  }
  throw new Error(`PayPal Agent Toolkit returned an unexpected order payload: ${String(out).slice(0, 240)}`);
}

/** Agent Toolkit create_order only accepts USD; other currencies fall back to REST. */
export const toolkitOrdersGateway: OrdersGateway = {
  mode: "sandbox-agent-toolkit",
  // REST create so we control application_context and always get an approve / payer-action link.
  // get + capture still go through the Agent Toolkit (with REST fallback).
  async create(input) { return restOrdersGateway.create(input); },
  async get(orderId) {
    try { return unwrapOrder(await run("get_order", { id: orderId }), orderId); }
    catch { return restOrdersGateway.get(orderId); }
  },
  async authorize(orderId) { return restOrdersGateway.authorize(orderId); },
  async capture(orderId) {
    try { return unwrapOrder(await run("pay_order", { id: orderId }), orderId); }
    catch { return restOrdersGateway.capture(orderId); }
  },
};

export function ordersGateway(): OrdersGateway {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return mockOrdersGateway;
  return process.env.PAYPAL_USE_AGENT_TOOLKIT === "false" ? restOrdersGateway : toolkitOrdersGateway;
}
