import type { Category } from "./policy/schema";

/** Mock merchant catalog. Only PayPal is real; these listings exist so the agent can plan a purchase.
 *  Names are original (no trademarked flagship merchants) so the demo can be shown in a public video. */
export interface CatalogItem {
  merchant: string;
  item: string;
  category: Category;
  amount: number;
  currency: "USD";
  aliases: string[];
}

export const CATALOG: CatalogItem[] = [
  { merchant: "Northline Studio", item: "Northline design seat", category: "software", amount: 16, currency: "USD", aliases: ["northline seat", "northline studio seat", "design seat", "northline studio"] },
  { merchant: "Northline Studio", item: "Northline icon pack", category: "design", amount: 35, currency: "USD", aliases: ["icon pack", "northline icon", "icons"] },
  { merchant: "Ledgerly", item: "Ledgerly Plus", category: "software", amount: 20, currency: "USD", aliases: ["ledgerly plus", "ledgerly"] },
  { merchant: "Forge Labs", item: "Forge Labs team seat", category: "software", amount: 22, currency: "USD", aliases: ["forge labs", "forge team", "forge"] },
  { merchant: "Paperplane", item: "Paperplane design toolkit", category: "design", amount: 29, currency: "USD", aliases: ["paperplane", "design toolkit"] },
  { merchant: "Giftly", item: "Giftly gift card", category: "gift_card", amount: 200, currency: "USD", aliases: ["giftly", "gift card", "giftcard", "gift cards"] },
  { merchant: "Coinlane", item: "Coinlane crypto purchase", category: "crypto", amount: 100, currency: "USD", aliases: ["coinlane", "bitcoin", "crypto"] },
];

export function matchCatalog(text: string): CatalogItem | undefined {
  const t = text.toLowerCase();
  // Prefer the longest alias match so "northline icon pack" wins over "northline studio".
  let best: { item: CatalogItem; len: number } | undefined;
  for (const item of CATALOG) {
    for (const alias of item.aliases) {
      if (t.includes(alias) && (!best || alias.length > best.len)) best = { item, len: alias.length };
    }
  }
  return best?.item;
}
