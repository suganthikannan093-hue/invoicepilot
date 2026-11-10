#!/usr/bin/env python3
"""Mux the v2 SpendGuard recording. Captions are driven only from chapter timestamps."""
from __future__ import annotations

import json, os, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get("SG_DEMO_WORK", "/tmp/sgdemo-v2"))
FONT_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
W, H, FPS = 1280, 800, 25
OPEN_DUR = 3.6
CLOSE_DUR = 6.0
OUT = Path("/workspace/spendguard-demo-v2.mp4")
COPY = ROOT / "docs" / "spendguard-demo-v2.mp4"
FRAMES = Path("/workspace/spendguard-demo-v2-frames")
INK = "0x1a1714"
TEAL = "0x0f6e5c"

# Captions must describe what is on screen in that chapter.
CAPTION = {
    "hook": "The problem  ·  sourced facts",
    "novelty": "What is new  ·  both directions, bound approvals",
    "policy": "Plain-English policy  ·  dry-run then compile",
    "allowed": "Hold  ·  Northline icon pack",
    "no_token": "No token, no PayPal  ·  403",
    "approve": "Approve this exact order",
    "paypal": "PayPal sandbox  ·  Orders v2",
    "paypal_login": "PayPal sandbox login  ·  email hidden",
    "blocked": "Blocked  ·  gift card",
    "injection": "Prompt injection blocked",
    "bill": "Bill  ·  money in",
    "bill_result": "PayPal invoice created",
    "intake": "Invoice Intake  ·  poisoned notes blocked",
    "audit": "Hash-chained audit  ·  verify",
    "close": "Tech  ·  Design  ·  Impact  ·  Innovation",
}


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    print("+", " ".join(str(c) for c in cmd[:8]), "..." if len(cmd) > 8 else "")
    kw.setdefault("stderr", subprocess.PIPE)
    kw.setdefault("stdout", subprocess.DEVNULL)
    r = subprocess.run(cmd, **kw)
    if r.returncode != 0:
        err = (r.stderr or b"")
        if isinstance(err, bytes):
            err = err.decode("utf-8", "replace")
        print(err[-2000:])
        raise subprocess.CalledProcessError(r.returncode, cmd)
    return r


def probe(path: Path, key: str) -> str:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", key, "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    ).strip()
    return out.splitlines()[0]


def escape_drawtext(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")


def title_card(path: Path, duration: float, lines: list[tuple[str, int, str, int]], bg: str = INK) -> None:
    filters = []
    # teal rule
    filters.append(f"drawbox=x=80:y=200:w=120:h=6:color={TEAL}:t=fill")
    for text, size, color, y in lines:
        font = FONT_B if size >= 32 else FONT_R
        filters.append(
            f"drawtext=fontfile={font}:text='{escape_drawtext(text)}':fontsize={size}:"
            f"fontcolor={color}:x=80:y={y}"
        )
    vf = ",".join(filters)
    run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={bg}:s={W}x{H}:d={duration}:r={FPS}",
            "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(path),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    meta = json.loads((WORK / "chapters.json").read_text())
    durations = json.loads((WORK / "tts-durations.json").read_text())
    chapters = [c for c in meta["chapters"] if c["id"] != "end"]
    end_at = meta["chapters"][-1]["at"] if meta["chapters"] else meta.get("durationSec", 0)
    outcome = meta.get("outcome") or {}

    raw = WORK / "raw-demo.webm"
    if not raw.exists():
        raise SystemExit(f"missing raw video: {raw}")

    hook_at = next(c["at"] for c in chapters if c["id"] == "hook")
    trim_start = max(0.0, hook_at - 0.20)
    raw_dur = float(probe(raw, "format=duration"))

    # If the PayPal sandbox wait is long, keep the start of the login (email is
    # blurred in-frame) and the last seconds before the next chapter, using only
    # chapter timestamps — never fixed offsets from a previous recording.
    login_at = next((c["at"] for c in chapters if c["id"] == "paypal_login"), None)
    after_paypal = next((c["at"] for c in chapters if c["id"] == "blocked"), None)
    keep = [(trim_start, raw_dur)]
    if login_at is not None and after_paypal is not None and after_paypal - login_at > 28:
        keep = [
            (trim_start, login_at + 14.0),
            (max(login_at + 14.0, after_paypal - 8.0), raw_dur),
        ]
        print("paypal trim windows", keep)

    def adj(t: float) -> float:
        out = 0.0
        for a, b in keep:
            if t < a:
                return out
            if t <= b:
                return out + (t - a)
            out += b - a
        return out

    segs = []
    for i, (a, b) in enumerate(keep):
        seg = WORK / f"seg-{i}.mp4"
        run(
            [
                "ffmpeg", "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", str(raw),
                "-an",
                "-vf", f"fps={FPS},scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
                str(seg),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        segs.append(seg)
        print(f"segment {i}: {a:.2f}-{b:.2f}")
    seglst = WORK / "segments.txt"
    seglst.write_text("".join(f"file '{s}'\n" for s in segs))
    main_src = WORK / "main-scaled.mp4"
    run(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(seglst),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-an",
            str(main_src),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Caption from chapter start to next chapter (or end)
    boxes, texts = [], []
    caption_windows = []
    for i, ch in enumerate(chapters):
        label = CAPTION.get(ch["id"])
        if not label:
            continue
        start = adj(ch["at"])
        stop = adj(chapters[i + 1]["at"] if i + 1 < len(chapters) else end_at)
        if stop - start < 0.25:
            continue
        enable = f"between(t,{start:.3f},{stop:.3f})"
        boxes.append(f"drawbox=x=0:y=ih-64:w=iw:h=64:color={INK}@0.88:t=fill:enable='{enable}'")
        boxes.append(f"drawbox=x=0:y=ih-64:w=8:h=64:color={TEAL}:t=fill:enable='{enable}'")
        texts.append(
            f"drawtext=fontfile={FONT_B}:text='{escape_drawtext(label)}':fontsize=22:"
            f"fontcolor=white:x=28:y=h-42:enable='{enable}'"
        )
        caption_windows.append({"id": ch["id"], "label": label, "start": start, "stop": stop, "mid": (start + stop) / 2})

    main_v = WORK / "main-captioned.mp4"
    vf = ",".join(boxes + texts) + ",format=yuv420p"
    run(
        [
            "ffmpeg", "-y", "-i", str(main_src), "-vf", vf, "-an",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            str(main_v),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    main_dur = float(probe(main_v, "format=duration"))
    print(f"main video {main_dur:.2f}s (trim_start {trim_start:.2f}s, captions from timeline)")

    opening, closing = WORK / "opening.mp4", WORK / "closing.mp4"
    title_card(
        opening,
        OPEN_DUR,
        [
            ("SPENDGUARD", 68, "white", 230),
            ("One guard for agent spend and invoices", 28, "0xf3eee6", 320),
            ("OWASP LLM01:2025  ·  Prompt Injection is the #1 LLM risk", 20, "0x9ee0d0", 430),
            ("PayPal Agent Toolkit  ·  agents can create orders and invoices", 20, "0x9ee0d0", 470),
            ("Live PayPal sandbox demo", 20, "0xcfc6b8", 540),
        ],
    )
    title_card(
        closing,
        CLOSE_DUR,
        [
            ("SPENDGUARD", 60, "white", 150),
            ("Tech  ·  Design  ·  Impact  ·  Innovation  ·  Presentation", 22, "0x9ee0d0", 240),
            ("One policy. Both directions. Exact-order-bound approvals.", 22, "0xf3eee6", 310),
            ("spendguard-suganthikannan093.vercel.app", 24, "white", 400),
            ("github.com/suganthikannan093-hue/invoicepilot/tree/spendguard", 18, "0xcfc6b8", 450),
            ("Orders v2  ·  Invoicing v2  ·  Agent Toolkit", 18, "0xcfc6b8", 530),
            ("Invoice Intake  ·  hash-chained audit  ·  policy dry-run", 18, "0xcfc6b8", 565),
        ],
    )

    concat_v = WORK / "video-noaudio.mp4"
    (WORK / "concat.txt").write_text(f"file '{opening}'\nfile '{main_v}'\nfile '{closing}'\n")
    run(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(WORK / "concat.txt"),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-r", str(FPS), "-an", str(concat_v),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    video_dur = float(probe(concat_v, "format=duration"))
    print(f"concat video {video_dur:.2f}s")

    def at_chapter(cid: str) -> float:
        return OPEN_DUR + adj(next(c["at"] for c in chapters if c["id"] == cid))

    paypal_done = bool(
        outcome.get("paypalCapture") or str(outcome.get("paypalStatus") or "").upper() == "COMPLETED"
    )
    audio_plan = [
        ("hook", at_chapter("hook")),
        ("novelty", at_chapter("novelty")),
        ("policy", at_chapter("policy")),
        ("allowed", at_chapter("allowed")),
        ("no_token", at_chapter("no_token")),
        ("approve", at_chapter("approve")),
    ]
    if any(c["id"] == "paypal" for c in chapters):
        audio_plan.append(("paypal_completed" if paypal_done else "paypal_pending", at_chapter("paypal")))
    audio_plan += [
        ("blocked", at_chapter("blocked")),
        ("injection", at_chapter("injection")),
        ("bill_draft", at_chapter("bill")),
        ("intake", at_chapter("intake")),
        ("audit", at_chapter("audit")),
        ("close", at_chapter("close")),
    ]

    delayed = []
    for name, start in audio_plan:
        src = WORK / "tts" / f"{name}.mp3"
        if not src.exists():
            raise SystemExit(f"missing tts clip: {src}")
        wav = WORK / "tts" / f"{name}-delay.wav"
        delay_ms = max(0, int(round(start * 1000)))
        run(
            [
                "ffmpeg", "-y", "-i", str(src),
                "-af", f"aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay={delay_ms}|{delay_ms}",
                "-t", f"{video_dur:.3f}", str(wav),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        delayed.append(wav)
        print(f"audio {name} @ {start:.2f}s ({durations.get(name, 0):.2f}s)")

    mixed = WORK / "narration-mix.wav"
    inputs = []
    for w in delayed:
        inputs += ["-i", str(w)]
    run(
        [
            "ffmpeg", "-y", *inputs,
            "-filter_complex", f"amix=inputs={len(delayed)}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95",
            "-ar", "48000", "-ac", "2", str(mixed),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg", "-y", "-i", str(concat_v), "-i", str(mixed),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
            "-shortest", "-movflags", "+faststart", str(OUT),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    COPY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT, COPY)

    stamps = [{"id": "opening", "title": "Title card", "at": 0.0, "label": "SpendGuard"}]
    for ch in chapters:
        stamps.append({"id": ch["id"], "title": ch["title"], "at": round(OPEN_DUR + adj(ch["at"]), 2), "label": CAPTION.get(ch["id"])})
    stamps.append({"id": "closing", "title": "Closing card", "at": round(OPEN_DUR + main_dur, 2), "label": "SpendGuard"})

    # Extract a frame at each caption midpoint (in the final file = OPEN_DUR + mid)
    ev = []
    ev.append({"id": "opening", "label": "SpendGuard title", "t": OPEN_DUR / 2})
    for w in caption_windows:
        ev.append({"id": w["id"], "label": w["label"], "t": OPEN_DUR + w["mid"]})
    ev.append({"id": "closing", "label": "Closing card", "t": OPEN_DUR + main_dur + CLOSE_DUR / 2})

    frame_meta = []
    for i, item in enumerate(ev, 1):
        t = min(max(0.08, item["t"]), video_dur - 0.08)
        dest = FRAMES / f"{i:02d}-{item['id']}.png"
        run(
            ["ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", str(OUT), "-frames:v", "1", str(dest)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        frame_meta.append({"file": dest.name, "id": item["id"], "label": item["label"], "t": round(t, 2)})
        print(f"frame {dest.name} @ {t:.2f}s  caption={item['label']}")

    # Contact sheet
    n = len(frame_meta)
    cols = 4
    rows = (n + cols - 1) // cols
    sheet = Path("/workspace/spendguard-demo-v2-contact-sheet.png")
    # pad to cols*rows
    inputs = []
    for i, fm in enumerate(frame_meta):
        inputs += ["-i", str(FRAMES / fm["file"])]
    while len(inputs) // 2 < cols * rows:
        # blank
        blank = WORK / f"blank-{len(inputs)}.png"
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={INK}:s={W}x{H}", "-frames:v", "1", str(blank)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        inputs += ["-i", str(blank)]
    layout = "".join(f"{i % cols}_{i // cols}|" for i in range(cols * rows)).rstrip("|")
    run(
        [
            "ffmpeg", "-y", *inputs,
            "-filter_complex", f"scale=320:200,tile={cols}x{rows}",
            str(sheet),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"contact sheet {sheet}")

    dur = float(probe(OUT, "format=duration"))
    width, height = probe(OUT, "stream=width"), probe(OUT, "stream=height")
    (ROOT / "docs" / "spendguard-demo-v2-timestamps.json").write_text(
        json.dumps(
            {
                "duration": dur,
                "chapters": stamps,
                "captionWindows": [
                    {**w, "finalStart": round(OPEN_DUR + w["start"], 2), "finalStop": round(OPEN_DUR + w["stop"], 2), "finalMid": round(OPEN_DUR + w["mid"], 2)}
                    for w in caption_windows
                ],
                "frames": frame_meta,
                "outcome": outcome,
                "audioPlan": [{"clip": n, "at": round(t, 2)} for n, t in audio_plan],
            },
            indent=2,
        )
    )
    print(f"OUTPUT {OUT} duration={dur:.2f}s {width}x{height}")
    if dur >= 180:
        print("WARNING: duration is 3:00 or longer", file=sys.stderr)
        sys.exit(2)
    if dur >= 175:
        print("WARNING: duration is over 2:55", file=sys.stderr)


if __name__ == "__main__":
    main()
