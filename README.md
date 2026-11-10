# SpendGuard

Live demo: **[https://spendguard-suganthikannan093.vercel.app](https://spendguard-suganthikannan093.vercel.app)**

One guard that lets an AI agent safely move a small business's money **in both directions** through PayPal.

- **Spend** (lead): the agent proposes a purchase; a plain-English spending policy is compiled into structured rules and enforced on the server; allowed buys can be completed; blocked buys are refused with a reason. Money moves through PayPal **Orders v2** (create and capture) only after a single-use, content-hash-bound approval token is presented.
- **Bill**: the same guard, the same policy file and the same audit log sit in front of PayPal **Invoicing v2**. Describe the work in plain English, review the draft, and approve it. The invoice state machine is `DRAFTED → CREATED → SENT → PAID`, with reminders, collections, live status and PayPal import.
- **Invoice Intake**: a seller-side PayPal invoice can be received as untrusted data. Notes are scanned for invoice-borne prompt injection, then the same spend policy and exact-order-bound token decide whether the buyer-side agent may pay it.

> 🔒 **The agent never holds PayPal credentials.** The server is the only path to PayPal. A prompt injection can at worst propose a purchase, never make one. Calling the capture endpoint without a valid approval token returns **403**. Approvals are single-use, expire in 10 minutes, and are bound to the exact item, merchant and amount you saw.

## Features
- **Policy as code, written in plain English.** OpenAI `gpt-4o-mini` compiles your rules into strict JSON, validated with Zod. Example: max $40/day, software and design only, never gift cards or crypto, over $25 needs your approval, merchant allowlist. Invoices share the same file (always need approval; cap at $10,000 by default).
- **Policy dry-run.** Compile a new rule without saving it, and see what it would decide for recent agent actions or a built-in demo set.
- **Spend agent.** Plans a purchase (item, merchant, amount, category) against a catalog of neutral merchants. The policy engine decides `allow`, `needs_approval` or `block`, with a human-readable reason.
- **Prompt-injection guard.** Untrusted product-page, tool, or invoice-note output is treated as data. If it tries to override the policy, the purchase is blocked even when the surface item looks allowed.
- **Invoice Intake (closed-loop).** A PayPal invoice issued on the Bill side can be taken in on the Spend side and held behind the same exact-order-bound token.
- **Human-in-the-loop PayPal writes.** Single-use, 10-minute approval tokens bound to the SHA-256 of the exact purchase or invoice you saw. Editing after approval invalidates the token. Missing token → 403.
- **PayPal sandbox, both directions.** Orders v2 (create, get, capture) for spend; Invoicing v2 (create, send, get, remind) plus the official **PayPal Agent Toolkit**.
- **Tamper-evident audit log.** Every policy decision, approval, guard block and PayPal call is SHA-256 chained, tagged spend or bill, with a **Verify chain** button and an exportable receipt.
- **Bill** keeps the invoice reviewer, cash-flow dashboard, collections agent, live 20s PayPal status, reminders and invoice import.
- **Runs with zero keys:** an offline mock policy compiler and purchase planner, plus a clearly labelled **mock PayPal** (order IDs `ORD-MOCK-…`, invoice IDs `INV2-MOCK-…`).

## Architecture
```mermaid
flowchart LR
  U[You] -->|plain-English policy + "buy this"| UI[Next.js UI]
  UI -->|compile / propose / dry-run| API[Next.js API]
  API --> LLM[lib/llm + lib/policy/compiler + lib/spend/plan<br/>gpt-4o-mini structured outputs + Zod]
  API --> POL[lib/policy/engine<br/>allow / block / needs_approval / injection]
  UI -->|Approve + content hash| G[lib/approval.ts<br/>single-use 10-min tokens]
  G -->|X-Approval-Token| API
  API -->|consume token| G
  G -->|ok, spend or intake| ORD[PayPal Orders v2<br/>create + capture]
  G -->|ok, bill| INV[PayPal Invoicing v2<br/>REST + Agent Toolkit]
  API --> ST[(File store locally<br/>Upstash Redis in production)]
```

| Layer | Path | Notes |
|---|---|---|
| Policy schema | `lib/policy/schema.ts` | Zod `PolicySchema` + JSON schema for OpenAI |
| Compiler | `lib/policy/compiler.ts` | `compilePolicy` / deterministic `mockCompilePolicy` / `simulatePolicy` dry-run |
| Engine | `lib/policy/engine.ts` | Spend and bill decisions, injection detector, daily cap |
| Approval guard | `lib/approval.ts` | Invoice actions `create` / `send` / `remind`; spend action `capture`. Tokens are random, stored hashed, single use, expire after 10 min, bound to id + action + SHA-256 of the exact content |
| Spend service | `lib/spend/service.ts` | The only path to Orders v2 writes, including Invoice Intake |
| Bill service | `lib/service.ts` | The only path to Invoicing v2 writes: same guard, same policy, same audit log |
| Audit chain | `lib/audit.ts` | SHA-256 hash chain, verify, exportable receipt |
| Orders | `lib/paypal/orders.ts` | REST `api-m.sandbox.paypal.com` /v2/checkout/orders, optional Agent Toolkit, labelled mock |
| Invoices | `lib/paypal/*` | REST + `@paypal/agent-toolkit` invoice tools |
| Store | `lib/store.ts` | File store for local/tests (`data/db.json` or `SPENDGUARD_DB`). Upstash Redis when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or the Vercel Marketplace aliases `KV_REST_API_URL`/`KV_REST_API_TOKEN` are set. On Vercel without Redis, the file store uses `/tmp`. |

## Setup
Requirements: Node 20+ and pnpm.
```bash
pnpm install
cp .env.example .env.local   # fill in what you have; everything is optional
pnpm dev                     # http://localhost:3000
```

### PayPal sandbox credentials
The same sandbox app is used for Orders v2 and Invoicing v2.

1. Sign in at <https://developer.paypal.com/> (a free PayPal account works).
2. **Testing Tools → Sandbox Accounts**: a default *Business* (merchant) and *Personal* (buyer) account are created for you. Use the Personal account when a spend needs payer approval, and as the invoice recipient email.
3. **Apps & Credentials** → make sure the toggle says **Sandbox** → **Create App** (Merchant type, linked to the sandbox business account).
4. Copy the **Client ID** and **Secret** into `.env.local` as `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, then restart `pnpm dev`. The header badge changes from **PayPal: MOCK** to **Sandbox**.
5. To inspect orders and invoices, log in to <https://www.sandbox.paypal.com/> with the sandbox business (and, for payer approval, personal) account.

The app only ever talks to `api-m.sandbox.paypal.com`. Secrets are read from env vars and never logged or returned by any API.

If a sandbox capture is refused because the buyer has not yet approved the order, the UI shows the PayPal approve link and a **Capture now** button. Mock mode completes the order immediately.

### OpenAI
Set `OPENAI_API_KEY` (model `gpt-4o-mini` by default). Without it, a deterministic compiler and planner are used, and the UI says so.

### Environment variables
| Variable | Required? | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | No | Policy compiler, purchase planner, invoice parser, reminder writer. Mock fallback if unset. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini`. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | No | Sandbox app credentials. Mock PayPal if unset. |
| `PAYPAL_USE_AGENT_TOOLKIT` | No | Default `true`. Set `false` to use REST only. |
| `MOCK_PAYPAL_AUTOPAY` | No | Mock invoicing only: flip SENT → PAID after a few status checks. |
| `SPENDGUARD_PUBLIC_URL` | No | Public base URL used as the PayPal order return/cancel URL. |
| `SPENDGUARD_DB` | No | Override JSON file-store path. Falls back to `INVOICEPILOT_DB`, then `data/db.json` (or `/tmp/spendguard-db.json` on Vercel). |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | When both are set, the store uses Upstash Redis instead of a file. The Vercel Marketplace aliases `KV_REST_API_URL` / `KV_REST_API_TOKEN` also work. |

## Scripts
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm dev
```
`vitest` covers policy compilation, spend decisions (allow / block / needs-approval / injection / 403 without a token), Invoice Intake, policy dry-run, the hash-chained audit log, invoice parsing, totals, payload mapping and the approval guard (missing, replayed, expired, cross-action and post-edit tokens, the state machine and invalid drafts).

## Safety design
- **The agent can't write to PayPal.** The LLM only returns JSON (a policy, a purchase plan, or an invoice draft). Every PayPal write goes through a service that first consumes a server-issued approval token, and spend is also refused when the policy says `block`.
- **You approve what you saw.** The approve call must send the content hash the UI rendered. If the stored purchase or draft differs, approval is refused.
- **Prompt-injection hygiene.** User text, untrusted product-page output and invoice notes are fenced as data. The policy engine blocks override attempts even if the planner extracted an otherwise-allowed item.
- **Tamper-evident audit log** records guard blocks as well as successes, in both directions, and can be re-hashed by anyone.
- **Mock modes are labelled** in the UI, the API (`/api/health`) and PayPal IDs.

## Demo
Live app: [https://spendguard-suganthikannan093.vercel.app](https://spendguard-suganthikannan093.vercel.app). See [HACKATHON.md](HACKATHON.md) and `docs/spendguard-demo-script.md` for the video script.

## Hosting
Production runs on **Vercel** (hobby plan) at the URL above. Set `OPENAI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `SPENDGUARD_PUBLIC_URL` in the Vercel project. Production uses a free-tier Upstash Redis store (`spendguard-redis`) connected through the Vercel Marketplace. The Marketplace injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the app also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Without Redis, the file store uses `/tmp` and resets when the instance is recycled.

## License
MIT. See [LICENSE](LICENSE).
