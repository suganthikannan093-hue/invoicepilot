# PayPal AI Hackathon: InvoicePilot submission pack

Sources: [overview](https://paypalaihackathon.devpost.com/), [official rules](https://paypalaihackathon.devpost.com/rules) and [resources](https://paypalaihackathon.devpost.com/resources), read 3 Nov 2026.

## Key facts
- **Deadline:** Thu **12 Nov 2026, 12:00 PM PT (PST, UTC−8)** = **Fri 13 Nov 2026, 1:30 AM IST**. The overview page also shows it as 3:00 PM EST. Aim to submit by 12 Nov evening IST.
- Judging runs 1–15 Dec 2026, and winners are announced around 21 Dec 2026.
- **Mandatory:** meaningfully use **PayPal developer platform (free sandbox)** **and** an **AI tool/model** of your choice, with PayPal integration *central*. No specific SDK is mandated. The PayPal Agent Toolkit and MCP server are listed resources, not requirements. Sponsor tools (AG Grid, APIMatic, Render, …) are optional and only needed for sponsor prizes.
- Stage 1 is pass/fail on theme fit and use of the required APIs. Stage 2 uses **5 equally weighted criteria**: Technological Implementation, Design, Potential Impact, Innovation/Idea and Presentation. Tie-breaks go in that order, so Technological Implementation matters most.
- Prizes to aim for: Grand prizes, **Best Use of PayPal + AI**, **Best Use of Agentic Commerce**, Most Impactful and Best Demo Delivery. A project can win at most 1 Grand or Honorable Mention prize plus 1 Sponsor prize.

## Compliance checklist
| Requirement (source) | Status |
|---|---|
| Integrates PayPal developer platform via sandbox (rules §4) | ✅ Invoicing v2 REST (create, send, get, remind) + `@paypal/agent-toolkit` invoice tools. Verified in the sandbox: create, send, remind, import, and a PAID invoice (INV2-WVHX-G7WR-CSZQ-DQTN) |
| Meaningful AI (rules §4) | ✅ gpt-4o-mini structured outputs for invoice extraction + reminder drafting |
| Working prototype, not a mockup (rules §4) | ✅ end-to-end flow verified over HTTP |
| Text description of features (submission reqs) | ✅ draft below |
| Functional demo: setup instructions or hosted URL | ✅ README setup. Optional: host on Render (also qualifies for Render prizes) |
| Identify AI tools and how they're used | ✅ see description |
| **Public repo** (GitHub/GitLab/Bitbucket) with all source | ⏳ user: push the repo and make it public |
| **Open-source license visible in the About section** | ✅ `LICENSE` (MIT). ⏳ confirm GitHub detects it |
| **Demo video < 3 min, public on YouTube**, shows it working, no unlicensed music/trademarks | ✅ `docs/demo.mp4` (2:26, real sandbox, AI voice narration (OpenAI TTS), no music). ⏳ user: upload to YouTube as Public |
| Testing access: creds/keys/sandbox details or how to obtain them | ✅ README explains obtaining creds; mock modes let judges run with no keys |
| English materials | ✅ |
| New or significantly updated during the period (1 Oct–12 Nov 2026) | ✅ built Nov 2026 |
| Original work, third-party terms respected | ✅ deps are open source (MIT/Apache); uses PayPal sandbox only |
| Eligibility: not an employee of PayPal, Devpost or a judge's employer, nor family/household | ⏳ user: confirm (sponsor-tool judges' companies count too) |

## Judging criteria → what we show
| Criterion | How InvoicePilot scores |
|---|---|
| Technological Implementation | Real Invoicing v2 lifecycle (draft → send → status → remind) via REST + the official Agent Toolkit; OAuth token caching; idempotency keys; strict structured outputs + Zod; server-side approval guard; 14 unit tests |
| Design | One coherent flow (Describe → Review → Approve → Send → Collect), stepper, live totals and validation, assumption call-outs, confirm modals, audit log |
| Potential Impact | Freelancers lose hours to invoicing and chasing late payments; plain English to a payable PayPal invoice in under a minute; polite, escalating reminders |
| Innovation | "Agentic commerce with a human hand on the brake": the agent does the work, but every money-moving action is a cryptographically bound, single-use approval of exactly what you saw |
| Presentation | Script below: problem → live demo → safety → impact in under 3 min |

## Demo video script (about 2:45)
1. **0:00–0:20 Hook.** "Freelancers spend hours writing invoices and even longer chasing them. InvoicePilot is an AI agent that does both, but never moves without your OK."
2. **0:20–0:55 Describe → Draft.** Paste Example 1. Click *Draft invoice*. Point out the line items, the 8% tax, due date net 15, the live total and the agent's assumptions.
3. **0:55–1:15 Edit.** Change the hours from 12 to 14 and watch the totals update. Clear the email to show validation blocking approval, then restore it.
4. **1:15–1:45 Approve → PayPal.** Click *Approve & create PayPal draft*, show the confirm modal, then *Yes, I approve*. Show the PayPal invoice ID and DRAFT status, and briefly switch to sandbox.paypal.com to show the invoice there.
5. **1:45–2:05 Send.** *Confirm & send to client*, and the status becomes SENT. Optionally show the email in the sandbox buyer account.
6. **2:05–2:30 Collect.** *Check status*, *Draft reminder* (AI), edit one line, then *Approve & send reminder*.
7. **2:30–2:45 Safety + close.** Show the audit log and a `curl` to `/execute` without a token returning **403 "nothing goes to PayPal without your approval"**. "InvoicePilot: get paid faster, stay in control."

Record with **real sandbox creds** (header badge "Sandbox"), not mock mode, and use no copyrighted music.

## Draft Devpost description
**InvoicePilot: an AI invoice & collections agent for freelancers**

*Inspiration.* Freelancers lose billable time writing invoices and awkwardly chasing late payments. We wanted an agent that does the paperwork and the follow-up, but never moves money-related actions without the human.

*What it does.* Describe the job in plain English ("12 hours of React work at $95/h plus a $400 logo refresh, 8% tax, net 15"). InvoicePilot drafts a structured invoice with client, line items, tax, due date and note, and flags its assumptions. You edit anything, then approve, and the invoice is created in PayPal as a draft. A second confirm sends it to the client through PayPal. The agent then tracks status and writes polite, escalating reminders, which PayPal sends only when you approve them.

*How we built it.* Next.js 15 (App Router, TypeScript). **PayPal Invoicing API v2** in the sandbox (create, send, get, remind) through a REST client with an OAuth token cache and idempotency keys, and the official **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) for invoice status, send and reminder tools. **OpenAI gpt-4o-mini** with strict JSON-schema structured outputs, re-validated with **Zod**, handles invoice extraction and reminder writing. A server-side approval guard issues single-use, 10-minute tokens bound to the exact content you reviewed. Any edit invalidates them, and a state machine blocks out-of-order writes. Every step lands in an audit log. Vitest covers parsing, totals and the guard.

*AI tools used.* OpenAI gpt-4o-mini handles natural language to an invoice (structured outputs) and drafts reminder emails. The PayPal Agent Toolkit exposes PayPal invoice actions as agent tools.

*Challenges.* Making agent autonomy safe for money: we moved the approval rule from the UI into the server and bound it cryptographically to what the user saw.

*What's next.* Multi-currency client memory, recurring invoices, payment webhooks for instant PAID updates, and an MCP interface so any assistant can propose invoices that still need InvoicePilot approval.

## Remaining user-only steps
1. Create sandbox app creds (README → *PayPal sandbox credentials*) and send them through a secure field, then run one real sandbox create/send/remind.
2. Push to a **public GitHub repo** and check the MIT license shows in *About*.
3. Record the video (< 3 min) and upload it to **YouTube as Public**.
4. Fill in the Devpost submission form (description above, repo, video, tools used) before **Fri 13 Nov, 1:30 AM IST**.
5. Confirm eligibility (see the checklist).
6. Optional: deploy on Render for a hosted demo URL (and Render prize eligibility). That needs persistent storage or a DB in place of the JSON file.
