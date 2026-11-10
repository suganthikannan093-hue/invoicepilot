# SpendGuard — Devpost draft

Paste and adapt these sections on Devpost. Do not submit from this document. Every factual claim below is sourced or was verified on the live deployment this turn.

**Submission links**

- Live demo: https://spendguard-suganthikannan093.vercel.app
- Alternate production alias: https://spendguard-mu.vercel.app
- Repo (SpendGuard is the default branch): https://github.com/suganthikannan093-hue/invoicepilot
- Branch URL: https://github.com/suganthikannan093-hue/invoicepilot/tree/spendguard
- Demo video: upload `/workspace/spendguard-demo-v2.mp4` to YouTube as **Public**, under 3:00 (this cut is 2:47).

An older Render URL, https://spendguard-mand.onrender.com, is still running on the free plan and should not be the judging link.

## Tagline

One policy guard between an AI agent and PayPal — for money out and money in.

## Elevator pitch

AI agents can already create PayPal orders and invoices. SpendGuard is the policy layer in front of those writes: you describe the rules in plain English, the server compiles them, and nothing reaches PayPal without a single-use, 10-minute approval token bound to the exact item, merchant, and amount. The same guard covers spending (Orders v2) and invoicing (Invoicing v2), incoming invoices are scanned for prompt injection before they can be paid, and every decision is sealed in a hash-chained audit log.

## The problem

PayPal's Agent Toolkit is built so agents can create and manage orders and invoices through PayPal APIs ([PayPal Agent Toolkit quickstart](https://developer.paypal.com/ai-tools/toolkit), updated 4 June 2026). At the same time, the OWASP Top 10 for LLM Applications 2025 lists **LLM01:2025 Prompt Injection** as the first risk ([OWASP GenAI Top 10](https://genai.owasp.org/llm-top-10/)). If an agent can move money, a hidden instruction in a product page or an invoice note should not be enough to pay.

## What it does

- Write a spending and billing policy in plain English. `gpt-4o-mini` compiles it into structured rules, validated with Zod, and a budget meter shows today's cap.
- Dry-run a new rule without saving it, and see what it would decide.
- Ask the agent to buy. The engine returns allow, needs approval, or block, with a reason.
- Call capture without a token and the server returns 403. Approvals are single-use, expire in 10 minutes, and are bound to this exact item, merchant, and amount.
- Approved spends create a real PayPal sandbox Orders v2 order (optionally via the official Agent Toolkit).
- On Bill, the same policy and the same token sit in front of Invoicing v2: draft, review, create, send, remind, collections, live status, and import.
- Invoice Intake closes the loop: a seller invoice is treated as untrusted data, notes are scanned for invoice-borne prompt injection, and payment still requires the same exact-order-bound token.
- The unified audit log is SHA-256 chained, with a Verify button and an exportable receipt.

## How I built it

Next.js 15, TypeScript, Zod, OpenAI `gpt-4o-mini`, PayPal Orders v2, Invoicing v2, and `@paypal/agent-toolkit`. The LLM only returns JSON (a policy, a purchase plan, or an invoice draft). Every PayPal write goes through a service that first consumes a server-issued approval token. Tests are in Vitest (43 passing, 3 skipped). Hosted on Vercel.

## Judging criteria

### Technological Implementation

The live app talks to the PayPal sandbox with the official Agent Toolkit: `GET /api/health` reports `llm: openai` and `paypal: sandbox-agent-toolkit`. A verified walk through the production URL this turn compiled a policy with source `openai`, held a $35 Northline purchase, returned **403** without a token, created sandbox order `60A954372M859873M`, and created sandbox invoice `INV2-B6K3-6EHS-GH6B-MVZZ`. The demo recording created a second sandbox order `68A87028LN3359022` and invoice `INV2-9PCY-W4SM-APA5-7RE5`. The suite covers policy decisions, Invoice Intake, dry-run, the hash chain, and approval-token failures (missing, replayed, expired, wrong content).

Limits to be honest about: the product catalog is a built-in list, the injection detector is phrase-based, and until Upstash Redis is connected the Vercel deploy stores data in `/tmp` on the serverless instance.

### Design

Spend and Bill share one product shell: the same typography (Fraunces and IBM Plex Sans), the same paper-and-teal palette, the same policy and budget meter, the same decision cards, the same approval modal, and the same hash-chained audit. Tabs are "Spend · money out" and "Bill · money in", not a bolted-on second app. Empty states, a seeded default policy and budget meter, and a token explanation under the approve button and the 403 are all in the UI.

### Potential Impact

Agentic commerce is no longer hypothetical: PayPal ships a toolkit whose documented tools include `create_order` and `create_invoice` ([PayPal Agent Toolkit](https://developer.paypal.com/ai-tools/toolkit), [agent tools reference](https://developer.paypal.com/ai-tools/agent-tools)). The leading risk those agents inherit is prompt injection ([OWASP LLM01:2025](https://genai.owasp.org/llm-top-10/)). SpendGuard's impact story is a small-business agent that can buy and invoice only inside a policy, with a human token on every write. The demo video puts those two sources on screen.

### Innovation

Policy firewalls for agent spend are a crowded idea. What SpendGuard adds, and names in the UI, is:

1. **One guard for both directions** — the same policy file, approval model, and audit log for Orders v2 and Invoicing v2.
2. **Exact-order-bound approvals** — single-use, 10-minute tokens bound to the SHA-256 of the exact item, merchant, and amount. A missing or mismatched token returns 403.
3. **Invoice Intake** — closed-loop agent-to-agent commerce: a seller invoice is untrusted data, scanned for invoice-borne prompt injection, then held behind the same token before a buyer-side pay.
4. **Tamper-evident audit** — SHA-256 chain, verify, and an exportable receipt.
5. **Policy dry-run** — compile a rule without saving it and see the decisions.

### Presentation

The 2:47 video opens with the problem and the two sourced facts, pitches the novelty up front, then walks policy → hold → 403 → approve → real sandbox order → blocked gift card → prompt injection (labelled only when that decision is on screen) → Bill / Invoicing v2 → Invoice Intake → hash-chain verify, and closes against the five criteria. Captions are driven from the recording timeline and were checked against extracted frames. The sandbox buyer email is hidden on the PayPal login screen. The gift-card block is captioned as a blocked purchase, not as prompt injection.

## Built with

Next.js, TypeScript, React, Zod, OpenAI gpt-4o-mini, PayPal Orders v2, PayPal Invoicing v2, PayPal Agent Toolkit, Vitest, Vercel.

## Prize tracks to consider

Best Use of Agentic Commerce; Best Use of PayPal + AI.

## Notes for the submission form

- The repo's default branch is `spendguard`. Use that branch, not `main`.
- The live URL is the Vercel app above. The Render service was left in place and is not the judging link.
- Do not file InvoicePilot as a second entry: SpendGuard already includes the invoicing features.
