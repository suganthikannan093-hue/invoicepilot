import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "InvoicePilot: AI invoice & collections agent", description: "Describe the work, review, approve. Nothing goes to PayPal without you." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
