import type { Category } from "./policy/schema";

/** Mock merchant catalog. Only PayPal is real; these listings exist so the agent can plan a purchase. */
export interface CatalogItem {
  merchant: string;
  item: string;
  category: Category;
  amount: number;
  currency: "USD";
  aliases: string[];
}

export const CATALOG: CatalogItem[] = [
  { merchant: "Figma", item: "Figma Professional seat", category: "software", amount: 16, currency: "USD", aliases: ["figma seat", "figma professional", "renew figma", "figma"] },
  { merchant: "Figma", item: "Figma icon pack", category: "design", amount: 35, currency: "USD", aliases: ["icon pack", "figma icon", "icons"] },
  { merchant: "Adobe", item: "Adobe Creative Cloud", category: "software", amount: 55, currency: "USD", aliases: ["adobe", "creative cloud"] },
  { merchant: "Notion", item: "Notion Plus", category: "software", amount: 20, currency: "USD", aliases: ["notion plus", "notion"] },
  { merchant: "GitHub", item: "GitHub Team seat", category: "software", amount: 22, currency: "USD", aliases: ["github", "github team"] },
  { merchant: "Creative Market", item: "Design toolkit", category: "design", amount: 29, currency: "USD", aliases: ["creative market", "design toolkit"] },
  { merchant: "Amazon", item: "Amazon Gift Card", category: "gift_card", amount: 200, currency: "USD", aliases: ["amazon gift card", "gift card", "giftcard"] },
  { merchant: "Coinbase", item: "Bitcoin purchase", category: "crypto", amount: 100, currency: "USD", aliases: ["coinbase", "bitcoin", "crypto"] },
];

export function matchCatalog(text: string): CatalogItem | undefined {
  const t = text.toLowerCase();
  // Prefer the longest alias match so "figma icon pack" wins over "figma".
  let best: { item: CatalogItem; len: number } | undefined;
  for (const item of CATALOG) {
    for (const alias of item.aliases) {
      if (t.includes(alias) && (!best || alias.length > best.len)) best = { item, len: alias.length };
    }
  }
  return best?.item;
}
