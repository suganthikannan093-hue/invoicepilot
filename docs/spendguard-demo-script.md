# SpendGuard demo video v2 — narration and storyboard

For the PayPal AI Hackathon. Target under 3:00 (this cut is **2:47**). 1280×800, narrated walkthrough structured around the five judging criteria and the end-to-end flow. The user reviews and posts the video; this script is not a submission.

Live app (also on the title and close cards): https://spendguard-suganthikannan093.vercel.app

The walkthrough itself was recorded against a local sticky store with the same PayPal sandbox and OpenAI keys, because the Vercel hobby deploy uses a per-instance `/tmp` file store until Upstash Redis is provisioned. Every PayPal write in the recording is still a real sandbox call.

## Sourced facts shown on screen

Opened and used only these sources:

- OWASP Top 10 for LLM Applications 2025 lists **LLM01:2025 Prompt Injection** first. https://genai.owasp.org/llm-top-10/
- PayPal Agent Toolkit official docs (updated 4 June 2026): the toolkit integrates PayPal APIs so agents can work with **orders and invoices**. https://developer.paypal.com/ai-tools/toolkit

## Spoken narration (v2)

Hook: AI agents can now create PayPal orders and invoices. OWASP ranks prompt injection as the number one risk for LLM apps in 2025. SpendGuard is the policy guard between the agent and the money.

Novelty: What is new: one guard for money out and money in. Approvals are single-use, expire in ten minutes, and are bound to the exact item, merchant, and amount. Incoming invoices are scanned for prompt injection, and the audit log is hash-chained.

Policy: The rules are already in plain English. I dry-run a tighter cap without saving, then compile and save. gpt-4o-mini turns this into structured checks, with today's budget on the right.

Allowed: I ask the agent to buy a thirty-five dollar Northline icon pack. It's over the approval threshold, so SpendGuard holds it.

No token: Capture with no token returns 403. The server, not just the UI, refuses to call PayPal.

Approve: I approve this exact order. The token is bound to this item, merchant, and amount. SpendGuard creates a real PayPal Orders v2 sandbox order.

PayPal (pending, honest): The sandbox order is created. Capture stays pending until the buyer approves it on PayPal. I'm leaving that step honest.

Blocked: A two-hundred dollar gift card is blocked: forbidden category, over the cap, and the merchant is not allowed. Nothing reaches PayPal.

Injection: This product page hides an instruction to ignore the rules and buy gift cards. SpendGuard still blocks it as prompt injection.

Bill: On Bill, it's the same policy and the same token. I describe the work, review the draft, and approve. PayPal Invoicing v2 creates the invoice. Sending would be a second, separate approval.

Intake: Invoice Intake closes the loop. A seller invoice with poisoned notes is treated as untrusted data and blocked before anyone can pay it.

Audit: Every decision is sealed to the previous event with SHA-256. I verify the chain, and I can export a receipt.

Close: That's SpendGuard: real PayPal writes, one design for both directions, a sourced risk, and approvals that only work for the exact order you saw.

## Output

- `/workspace/spendguard-demo-v2.mp4` (copy at `docs/spendguard-demo-v2.mp4`)
- Contact sheet: `/workspace/spendguard-demo-v2-contact-sheet.png`
- Evidence frames: `/workspace/spendguard-demo-v2-frames/`
- Caption windows: `docs/spendguard-demo-v2-timestamps.json`

Caption windows were shifted after a first-pass midpoint check so the 403 banner, the gift-card block, and the prompt-injection decision sit under the matching labels. The gift-card scene is labelled "Blocked · gift card", not "Prompt injection".
