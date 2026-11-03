import type { PayPalGateway } from "./types";
import { mockGateway } from "./mock";
import { restGateway } from "./rest";
import { toolkitGateway } from "./toolkit";

export const hasPayPalCreds = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
export function gateway(): PayPalGateway {
  if (!hasPayPalCreds()) return mockGateway;
  return process.env.PAYPAL_USE_AGENT_TOOLKIT === "false" ? restGateway : toolkitGateway;
}
export type { PayPalGateway };
