// Print a PayPal invoice's status by id using the app's gateway.
// Usage: npx tsx --env-file=.env scripts/check-invoice.ts <INVOICE_ID>
import { gateway } from "../lib/paypal";

const id = process.argv[2];
if (!id) { console.error("Usage: check-invoice.ts <INVOICE_ID>"); process.exit(1); }
const gw = gateway();
gw.getStatus(id)
  .then((r) => console.log(JSON.stringify({ mode: gw.mode, ...r }, null, 2)))
  .catch((e) => { console.error("Error:", e instanceof Error ? e.message : e); process.exit(1); });
