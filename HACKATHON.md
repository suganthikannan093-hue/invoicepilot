# PayPal AI Hackathon: SpendGuard submission pack

Sources: [overview](https://paypalaihackathon.devpost.com/), [official rules](https://paypalaihackathon.devpost.com/rules) and [resources](https://paypalaihackathon.devpost.com/resources), read 3 Nov 2026.

This branch is the **SpendGuard** entry: one product that leads with policy-guarded agent spending and keeps invoicing as the same guard in the other direction. The earlier invoice-only app on `main` can still be filed as a separate, substantially different submission if you want Stage-1 insurance.

## Key facts
- **Deadline:** Thu **12 Nov 2026, 12:00 PM PT (PST, UTC−8)** = **Fri 13 Nov 2026, 1:30 AM IST**. The overview page also shows it as 3:00 PM EST. Aim to submit by 12 Nov evening IST.
- Judging runs 1–15 Dec 2026, and winners are announced around 21 Dec 2026.
- **Mandatory:** meaningfully use **PayPal developer platform (free sandbox)** **and** an **AI tool/model** of your choice, with PayPal integration *central*. No specific SDK is mandated. The PayPal Agent Toolkit and MCP server are listed resources, not requirements. Sponsor tools (AG Grid, APIMatic, Render, …) are optional and only needed for sponsor prizes.
- Stage 1 is pass/fail on theme fit and use of the required APIs. Stage 2 uses **5 equally weighted criteria**: Technological Implementation, Design, Potential Impact, Innovation/Idea and Presentation. Tie-breaks go in that order, so Technological Implementation matters most.
- Prize lanes to aim for: **Best Use of Agentic Commerce**, **Best Use of PayPal + AI**, and optionally **Best Use of Render** (credits, stacks with one honorable mention). A project can win at most 1 Grand or Honorable Mention prize plus 1 Sponsor prize.

## Compliance checklist
| Requirement (source) | Status |
|---|---|
| Integrates PayPal developer platform via sandbox (rules §4) | ✅ Orders v2 (create, get, capture) for spend + Invoicing v2 REST (create, send, get, remind) and `@paypal/agent-toolkit` invoice and order tools. Invoice sandbox work was previously verified (create, send, remind, import, and a PAID invoice). Orders v2 should be recorded against the real sandbox in the new demo video. |
| Meaningful AI (rules §4) | ✅ gpt-4o-mini structured outputs for the policy compiler, purchase planner, invoice extraction and reminder drafting |
| Working prototype, not a mockup (rules §4) | ✅ end-to-end spend and bill flows, with mock fallbacks when keys are missing |
| Text description of features (submission reqs) | ✅ draft below |
| Functional demo: setup instructions or hosted URL | ✅ README setup. Optional: host on Render (also qualifies for Render prizes) |
| Identify AI tools and how they're used | ✅ see description |
| **Public repo** (GitHub/GitLab/Bitbucket) with all source | ✅ https://github.com/suganthikannan093-hue/invoicepilot (public, MIT detected 7 Nov 2026). ⏳ user: merge or push the `spendguard` branch when you are ready; do not treat this doc as a push. |
| **Open-source license visible in the About section** | ✅ `LICENSE` (MIT); GitHub detects MIT (verified 7 Nov 2026) |
| **Demo video < 3 min, public on YouTube**, shows it working, no unlicensed music/trademarks | ⏳ user: record the SpendGuard script below (under 2:45) against the real sandbox, upload as Public. The earlier `docs/demo.mp4` (2:26) is the invoice-only video and should not be reused as the SpendGuard entry. |
| Testing access: creds/keys/sandbox details or how to obtain them | ✅ README explains obtaining creds; mock modes let judges run with no keys |
| English materials | ✅ |
| New or significantly updated during the period (1 Oct–12 Nov 2026) | ✅ built / significantly extended Nov 2026 |
| Original work, third-party terms respected | ✅ deps are open source (MIT/Apache); uses PayPal sandbox only |
| Eligibility: not an employee of PayPal, Devpost or a judge's employer, nor family/household | ⏳ user: confirm (sponsor-tool judges' companies count too) |

## Judging criteria → what we show
| Criterion | How SpendGuard scores |
|---|---|
| Technological Implementation | Orders v2 create/get/capture, Invoicing v2 lifecycle via REST + the official Agent Toolkit, OAuth token cache, an LLM policy compiler and purchase planner with Zod, hash-bound approval tokens, injection detector, unit tests for policy and the guard |
| Design | One product, two directions: policy + compiled rules, a clear allow/deny/needs-approval card, budget meter, unified audit log, and the invoice reviewer on the Bill tab |
| Potential Impact | Safe agent spending is a real blocker for agentic commerce; the same control plane also covers getting paid |
| Innovation | Policy-as-product for an agent wallet, not another invoice or checkout bot; both directions share one guard, one policy file and one audit log |
| Presentation | Built-in drama: an allowed buy, a blocked buy, an injection that fails, a 403, then a short invoicing pass through the same log |

## Demo video script (about 2:45, lead with spend)
Record with **real sandbox creds** (header badge "Sandbox"), not mock mode, and use no copyrighted music. Stay under 3 minutes.

1. **0:00–0:15 The problem.** "AI agents can spend money now. Who decides how much — and who can also let that agent get you paid? SpendGuard is one guard for both directions."
2. **0:15–0:35 Write the policy.** Show the default plain-English rules (max $40 a day, software and design only, never gift cards or crypto, over $25 needs approval, merchant allowlist). Click *Compile policy* and show the compiled JSON.
3. **0:35–1:00 Allowed buy.** Use *Allowed: $35 icon pack*. Show the decision card: needs approval, within the daily cap, design category, Figma on the allowlist. Click *Approve this exact order*, then *Yes, I approve*. Show the PayPal order ID and **COMPLETED** (or the approve-in-sandbox link and capture, if the payer step is required).
4. **1:00–1:15 Blocked buy.** Use *Blocked: $200 gift card*. The card says blocked, with reasons (category, cap, merchant). Nothing reaches PayPal.
5. **1:15–1:30 Attack test.** Use *Attack test: injected product page*. Show the hidden "ignore previous rules…" text. The guard still blocks it as prompt injection.
6. **1:30–1:45 No token, no money.** Propose the icon pack again (or reuse a proposed purchase) and click *Call capture with no token*. Show **403** "nothing goes to PayPal without your approval".
7. **1:45–2:00 Audit log and budget.** Scroll the unified audit log (allows, blocks, injection, 403) and the remaining daily budget.
8. **2:00–2:30 Bill, same guard (~30s).** Switch to the **Bill** tab. Paste a short invoice prompt, *Draft invoice*, *Approve & create PayPal draft*. Point at the same audit log now showing a bill event, and the policy line that invoices still need a token.
9. **2:30–2:45 Close.** "SpendGuard: agents can move money both ways, and you stay in control."

## Draft Devpost description
**SpendGuard: an AI agent that can only move PayPal money within rules you write in plain English**

*Inspiration.* People want agents that can buy software, pay for tools, and send invoices. One bad prompt — or one injected product page — should not be enough to drain a wallet or issue a rogue invoice. We wanted a single control plane for money an agent moves in both directions.

*What it does.* You write a spending policy in plain English ("Max $40 a day. Only software and design tools. Never gift cards or crypto. Anything over $25 needs my approval. Only these merchants."). SpendGuard compiles that into structured rules. The agent can propose a purchase; the server allows it, asks for your approval, or blocks it with a reason. Allowed purchases are created and captured as PayPal Orders v2 after you approve that exact order. A prompt injection is blocked. Calling the capture API without a token returns 403. On the Bill tab, the same guard, the same policy and the same audit log sit in front of PayPal invoicing: describe the work, review the draft, approve, send, and collect.

*How we built it.* Next.js 15 (App Router, TypeScript). **PayPal Orders API v2** in the sandbox (create, get, capture) through a REST client with an OAuth token cache and idempotency keys, and the official **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) for order and invoice tools. **PayPal Invoicing API v2** for the bill direction (create, send, get, remind). **OpenAI gpt-4o-mini** with strict JSON-schema structured outputs, re-validated with **Zod**, compiles the policy, plans purchases, extracts invoices and drafts reminders. A server-side approval guard issues single-use, 10-minute tokens bound to the exact content you reviewed. A policy engine enforces caps, categories, merchant allowlists and an injection detector before any PayPal call. Every step lands in a unified audit log. Vitest covers the compiler, spend decisions and the guard.

*AI tools used.* OpenAI gpt-4o-mini compiles plain-English policy into JSON rules, plans purchases, turns a work description into an invoice draft, and writes reminder emails (structured outputs, Zod-validated). The PayPal Agent Toolkit exposes PayPal order and invoice actions as agent tools, invoked only after the guard passes.

*Challenges.* Making agent autonomy safe for money in both directions: the approval rule and the policy live on the server, not in the UI, and untrusted product-page text cannot talk the agent past the guard.

*What's next.* Persistent merchant memory and a tighter PayPal payer approval path for headless capture, payment webhooks, and an MCP interface so any assistant can propose spends or invoices that still need SpendGuard's policy and approval.

## Remaining user-only steps
Verified 7 Nov 2026 IST (invoice-only tree): public repo + MIT detection done. This SpendGuard branch has not been pushed. No SpendGuard YouTube URL yet; Devpost final submission still unverified.
1. Review this branch locally, then approve a push of `spendguard` (or a new public repo) when you want it public. Nothing has been pushed from this work.
2. Record the SpendGuard demo (script above, < 3 min, real sandbox) and upload it to **YouTube as Public**.
3. Confirm eligibility (checklist row above).
4. Fill in the Devpost submission form yourself (description above, repo, video, tools used) before **Fri 13 Nov, 1:30 AM IST**. Do not automate the submission.
5. Optional: deploy on Render for a hosted demo URL (and Render prize eligibility). Use a persistent disk for `SPENDGUARD_DB` as described in the README.
6. Optional: also file the invoice-only project on `main` as a second, substantially different entry, using the earlier `docs/demo.mp4` uploaded to YouTube as Public.
