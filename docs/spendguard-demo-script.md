# SpendGuard demo video v3 — narration and storyboard

For the PayPal AI Hackathon. Target under 3:00 (this cut is **2:50**). 1280×800, narrated walkthrough structured around the five judging criteria and the end-to-end flow. The user reviews and posts the video; this script is not a submission.

Recorded against the live app: https://spendguard-suganthikannan093.vercel.app (Upstash Redis store). Every PayPal write is a real sandbox call. The buyer approval was completed; the order captures as COMPLETED.

## Sourced facts shown on screen

Opened and used only these sources:

- OWASP Top 10 for LLM Applications 2025 lists **LLM01:2025 Prompt Injection** first. https://genai.owasp.org/llm-top-10/
- PayPal Agent Toolkit official docs (updated 4 June 2026): the toolkit integrates PayPal APIs so agents can work with **orders and invoices**. https://developer.paypal.com/ai-tools/toolkit

## Spoken narration (v3)

Hook, novelty, policy, allowed, no_token, and approve are unchanged from v2.

PayPal (completed): I approve it in the PayPal sandbox and capture the payment. The order completes — a real order ID and a real capture ID.

The `paypal_pending` line is no longer used.

Blocked, injection, bill, intake, audit, and close are unchanged from v2.

## Output

- `/workspace/spendguard-demo-v3.mp4` (copy at `docs/spendguard-demo-v3.mp4`)
- Contact sheet: `/workspace/spendguard-demo-v3-contact-sheet.png`
- Evidence frames: `/workspace/spendguard-demo-v3-frames/`
- Caption windows: `docs/spendguard-demo-v3-timestamps.json`

Caption windows were remuxed after a visual midpoint check so the 403 banner, the PayPal login (email hidden), Complete Purchase, COMPLETED capture, the gift-card block, and the prompt-injection decision sit under the matching labels. The gift-card scene is labelled "Blocked · gift card", not "Prompt injection".
