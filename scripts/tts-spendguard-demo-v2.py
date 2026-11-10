#!/usr/bin/env python3
"""Generate OpenAI TTS clips for the SpendGuard v2 demo. Never prints secrets."""
from __future__ import annotations

import json, os, subprocess, sys, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
OUT_DIR = Path(os.environ.get("SG_DEMO_WORK", "/tmp/sgdemo-v2"))
OUT_DIR.mkdir(parents=True, exist_ok=True)

NARRATION = {
    "hook": "AI agents can now create PayPal orders and invoices. OWASP ranks prompt injection as the number one risk for LLM apps in 2025. SpendGuard is the policy guard between the agent and the money.",
    "novelty": "What is new: one guard for money out and money in. Approvals are single-use, expire in ten minutes, and are bound to the exact item, merchant, and amount. Incoming invoices are scanned for prompt injection, and the audit log is hash-chained.",
    "policy": "The rules are already in plain English. I dry-run a tighter cap without saving, then compile and save. gpt-4o-mini turns this into structured checks, with today's budget on the right.",
    "allowed": "I ask the agent to buy a thirty-five dollar Northline icon pack. It's over the approval threshold, so SpendGuard holds it.",
    "no_token": "Capture with no token returns 403. The server, not just the UI, refuses to call PayPal.",
    "approve": "I approve this exact order. The token is bound to this item, merchant, and amount. SpendGuard creates a real PayPal Orders v2 sandbox order.",
    "paypal_completed": "I approve it in the PayPal sandbox and capture the payment. The order completes — a real order ID and a real capture ID.",
    "paypal_pending": "The sandbox order is created. Capture stays pending until the buyer approves it on PayPal. I'm leaving that step honest.",
    "blocked": "A two-hundred dollar gift card is blocked: forbidden category, over the cap, and the merchant is not allowed. Nothing reaches PayPal.",
    "injection": "This product page hides an instruction to ignore the rules and buy gift cards. SpendGuard still blocks it as prompt injection.",
    "bill_draft": "On Bill, it's the same policy and the same token. I describe the work, review the draft, and approve. PayPal Invoicing v2 creates the invoice. Sending would be a second, separate approval.",
    "intake": "Invoice Intake closes the loop. A seller invoice with poisoned notes is treated as untrusted data and blocked before anyone can pay it.",
    "audit": "Every decision is sealed to the previous event with SHA-256. I verify the chain, and I can export a receipt.",
    "close": "That's SpendGuard: real PayPal writes, one design for both directions, a sourced risk, and approvals that only work for the exact order you saw.",
}


def load_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip("'").strip('"')
    return env


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        text=True,
    ).strip()
    return float(out)


def tts(text: str, dest: Path, api_key: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps({"model": "tts-1-hd", "voice": "nova", "input": text, "response_format": "mp3"}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            dest.write_bytes(res.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"TTS failed for {dest.name}: HTTP {e.code}") from None


def main() -> None:
    env = load_dotenv(ENV_PATH)
    api_key = env.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY missing")
    only = sys.argv[1:]
    tts_dir = OUT_DIR / "tts"
    tts_dir.mkdir(parents=True, exist_ok=True)
    durations = {}
    total = 0.0
    for name, text in NARRATION.items():
        if only and name not in only:
            continue
        dest = tts_dir / f"{name}.mp3"
        tts(text, dest, api_key)
        d = probe_duration(dest)
        durations[name] = round(d, 3)
        total += d
        print(f"{name}: {d:.2f}s  ({len(text.split())} words)")
    (OUT_DIR / "tts-durations.json").write_text(json.dumps(durations, indent=2))
    (OUT_DIR / "narration.json").write_text(json.dumps(NARRATION, indent=2))
    print(f"TOTAL speech {total:.2f}s  (target walkthrough ~150s plus cards)")


if __name__ == "__main__":
    main()
