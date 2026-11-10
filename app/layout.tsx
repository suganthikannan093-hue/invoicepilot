import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "SpendGuard — policy-guarded agent payments",
  description: "An AI agent that can spend and invoice through PayPal, but only within rules you write in plain English, and only after you approve.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
