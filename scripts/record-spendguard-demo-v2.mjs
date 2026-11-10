/**
 * Headless Playwright walkthrough of the live SpendGuard site.
 * Records 1280x800 video with a visible cursor, typed input, and chapter marks.
 * Never logs secrets. Buyer sandbox credentials are read from .paypal_sandbox_accounts if present.
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORK = process.env.SG_DEMO_WORK || "/tmp/sgdemo-v2";
const URL = process.env.SG_DEMO_URL || "https://spendguard-suganthikannan093.vercel.app";
const VIEWPORT = { width: 1280, height: 800 };

const POLICY_TEXT = `Max $40 a day.
Only software and design tools.
Never gift cards or crypto.
Anything over $25 needs my approval.
Only merchants I've used before: Northline Studio, Ledgerly, Paperplane, Forge Labs.
Invoices always need my approval, and no invoice over $10,000.`;

const TIGHT_POLICY = `Max $10 a day.
Only software.
Never gift cards or crypto.
Anything over $1 needs my approval.
Only merchants I've used before: Ledgerly.
Invoices always need my approval, and no invoice over $10,000.`;

const INVOICE_PROMPT =
  "Invoice Acme Robotics at billing@acme-robotics.test for a logo refresh for $35. 0% tax, net 15.";

function loadDotEnv(file) {
  if (!existsSync(file)) return {};
  const env = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function sandboxAccounts() {
  const p = path.join(ROOT, ".paypal_sandbox_accounts");
  return loadDotEnv(p);
}

await mkdir(path.join(WORK, "record"), { recursive: true });
const durations = await loadJson(path.join(WORK, "tts-durations.json"), {});

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: path.join(WORK, "record"), size: VIEWPORT },
  reducedMotion: "reduce",
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const start = Date.now();
const chapters = [];
const outcome = {
  paypalOrder: null,
  paypalStatus: null,
  paypalCapture: null,
  payerApproved: false,
  invoiceId: null,
  invoiceStatus: null,
  invoiceSent: false,
  notes: [],
};

const sec = () => (Date.now() - start) / 1000;
function mark(id, title) {
  const t = sec();
  chapters.push({ id, title, at: Number(t.toFixed(2)) });
  console.log(`MARK ${id} ${t.toFixed(2)} ${title}`);
}
const sleep = (ms) => page.waitForTimeout(ms);

async function installCursor() {
  await page.evaluate(() => {
    if (document.getElementById("demo-cursor")) return;
    const c = document.createElement("div");
    c.id = "demo-cursor";
    c.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 2l15 11-6.5 1.5L9 21z" fill="#0f6e5c" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    c.style.cssText =
      "position:fixed;left:20px;top:20px;z-index:2147483646;pointer-events:none;transition:left .28s cubic-bezier(.2,.8,.2,1),top .28s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));";
    const ring = document.createElement("div");
    ring.id = "demo-ring";
    ring.style.cssText =
      "position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #0f6e5c;border-radius:10px;opacity:0;transition:opacity .2s,left .28s,top .28s,width .28s,height .28s;box-shadow:0 0 0 3px rgba(15,110,92,.18);";
    document.documentElement.append(c, ring);
  });
}

async function moveTo(locator, opts = {}) {
  const loc = typeof locator === "string" ? page.locator(locator).first() : locator;
  await loc.waitFor({ state: "visible", timeout: opts.timeout ?? 20000 });
  const box = await loc.boundingBox();
  if (!box) return loc;
  const x = box.x + box.width * (opts.x ?? 0.5);
  const y = box.y + box.height * (opts.y ?? 0.5);
  await page.evaluate(
    ({ x, y, box }) => {
      const c = document.getElementById("demo-cursor");
      const r = document.getElementById("demo-ring");
      if (c) {
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;
      }
      if (r && box) {
        r.style.left = `${box.x - 4}px`;
        r.style.top = `${box.y - 4}px`;
        r.style.width = `${box.width + 8}px`;
        r.style.height = `${box.height + 8}px`;
        r.style.opacity = "1";
      }
    },
    { x, y, box }
  );
  await sleep(opts.travel ?? 350);
  return loc;
}

async function clickHuman(locator, opts = {}) {
  const loc = await moveTo(locator, opts);
  await sleep(120);
  await loc.click({ timeout: opts.timeout ?? 20000 });
  await page.evaluate(() => {
    const r = document.getElementById("demo-ring");
    if (r) setTimeout(() => (r.style.opacity = "0"), 400);
  });
  await sleep(opts.after ?? 250);
  return loc;
}

async function scrollTo(locator) {
  const loc = typeof locator === "string" ? page.locator(locator).first() : locator;
  await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await sleep(450);
  return loc;
}

async function typeHuman(locator, text, delay = 22) {
  const loc = await clickHuman(locator, { after: 200 });
  await loc.fill("");
  await loc.focus();
  await page.keyboard.type(text, { delay });
}

async function holdFor(id, pad = 0.55, chapterId = id) {
  const need = (durations[id] || 0) + pad;
  const chapter = [...chapters].reverse().find((c) => c.id === chapterId);
  const elapsed = chapter ? sec() - chapter.at : 0;
  const remain = need - elapsed;
  if (remain > 0.15) await sleep(remain * 1000);
}

async function waitForText(text, timeout = 30000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

async function showFacts(on) {
  await page.evaluate((on) => {
    const old = document.getElementById("demo-facts");
    if (old) old.remove();
    if (!on) return;
    const d = document.createElement("div");
    d.id = "demo-facts";
    d.innerHTML = `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.45;color:#fffdf8">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9ee0d0;margin-bottom:6px">Sourced facts</div>
      <div><b>OWASP LLM01:2025</b> — Prompt Injection is the #1 risk for LLM apps.</div>
      <div style="opacity:.8;font-size:12px;margin:2px 0 8px">Source: genai.owasp.org/llm-top-10</div>
      <div><b>PayPal Agent Toolkit</b> lets agents create orders and invoices.</div>
      <div style="opacity:.8;font-size:12px;margin-top:2px">Source: developer.paypal.com/ai-tools/toolkit</div>
    </div>`;
    d.style.cssText = "position:fixed;right:20px;top:92px;z-index:2147483644;width:420px;background:rgba(26,23,20,.92);border:1px solid #0f6e5c;border-radius:14px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.35);";
    document.documentElement.append(d);
  }, on);
}

async function hideSandboxEmail() {
  try {
    await page.addStyleTag({ content: `
      #email, input[name="login_email"], input[type="email"], #login_email, input[autocomplete="username"] {
        filter: blur(10px) !important;
        color: transparent !important;
        text-shadow: 0 0 10px #111 !important;
      }
    `});
    await page.evaluate(() => {
      if (document.getElementById("demo-email-hide")) return;
      const b = document.createElement("div");
      b.id = "demo-email-hide";
      b.textContent = "Sandbox buyer login · email hidden for the demo";
      b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a1714;color:#f7f1e8;padding:8px 16px;font:13px sans-serif;text-align:center";
      document.body.prepend(b);
    });
  } catch {}
}

async function approvePaypalIfPossible(approveUrl) {
  // Stay on the same recorded page so the sandbox checkout is in the video.
  const accounts = sandboxAccounts();
  const email = accounts.US_BUYER_EMAIL;
  const password = accounts.US_BUYER_PASSWORD;
  if (!email || !password || !approveUrl) {
    outcome.notes.push("No sandbox buyer credentials or approve URL; leaving capture pending.");
    return false;
  }
  try {
    mark("paypal_login", "PayPal sandbox login");
    await page.goto(approveUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(800);
    await hideSandboxEmail();
    await page.waitForTimeout(800);
    await installCursor();
    await hideSandboxEmail();
    for (const name of ["Accept", "Accept All", "Agree", "OK"]) {
      const btn = page.getByRole("button", { name, exact: true });
      if (await btn.count()) {
        try { await btn.first().click({ timeout: 2000 }); } catch {}
      }
    }
    const emailSel = page.locator("#email, input[name='login_email'], input[type='email']").first();
    if (await emailSel.count() && await emailSel.isVisible().catch(() => false)) {
      await hideSandboxEmail();
      await moveTo(emailSel);
      await emailSel.fill(email); // value is CSS-blurred; do not type it
      await hideSandboxEmail();
      await sleep(400);
      const next = page.locator("#btnNext, button:has-text('Next')").first();
      if (await next.count() && await next.isVisible().catch(() => false)) {
        try { await clickHuman(next, { after: 900 }); } catch {}
      }
    }
    const passSel = page.locator("#password, input[name='login_password'], input[type='password']").first();
    if (await passSel.count() && await passSel.isVisible().catch(() => false)) {
      await moveTo(passSel);
      await passSel.fill(password); // fill instantly; do not type a password
      await sleep(300);
      const login = page.locator("#btnLogin, button:has-text('Log In'), #btnLogin").first();
      await clickHuman(login, { after: 1200 });
    }
    await sleep(2500);
    const payBtns = [
      "#payment-submit-btn",
      "[data-testid='submit-button']",
      "button#confirmButton",
      "button:has-text('Complete Purchase')",
      "button:has-text('Pay Now')",
      "button:has-text('Agree & Pay')",
      "button:has-text('Continue to Review Order')",
      "button:has-text('Continue')",
      "button:has-text('Approve')",
    ];
    let clicked = false;
    const deadline = Date.now() + 28000;
    while (Date.now() < deadline && !clicked) {
      for (const sel of payBtns) {
        const b = page.locator(sel).first();
        if (await b.count()) {
          try {
            if (await b.isVisible()) {
              await clickHuman(b, { after: 800 });
              clicked = true;
              break;
            }
          } catch {}
        }
      }
      if (!clicked) await sleep(800);
    }
    await sleep(2200);
    outcome.payerApproved = clicked;
    if (!clicked) outcome.notes.push("PayPal checkout loaded but the approve button was not clicked.");
    try {
      await page.screenshot({ path: path.join(WORK, "paypal-after.png") });
    } catch {}
    return clicked;
  } catch (e) {
    outcome.notes.push("PayPal sandbox approval did not complete; leaving capture pending.");
    try { await page.screenshot({ path: path.join(WORK, "paypal-error.png") }); } catch {}
    return false;
  }
}

try {
  // Warm + load
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("h1", { timeout: 30000 });
  await installCursor();
  // Wait for health badges
  await page.getByText("PayPal:", { exact: false }).first().waitFor({ timeout: 20000 });
  const badge = await page.locator("header .badge").allTextContents();
  console.log("BADGES", badge.join(" | "));
  if (badge.some((b) => /MOCK/i.test(b))) {
    throw new Error("Live site is in mock PayPal mode; will not record a mock demo.");
  }
  await sleep(800);

  // 1. Hook — header + sourced facts on screen
  mark("hook", "The problem · sourced facts");
  await moveTo("header h1");
  await showFacts(true);
  await sleep(700);
  await moveTo(".safety");
  await holdFor("hook");

  // 1b. Novelty
  mark("novelty", "What's new");
  await moveTo("nav.tabs");
  await sleep(500);
  await moveTo(page.getByRole("heading", { name: /Plain-English rules/i }));
  await holdFor("novelty");
  await showFacts(false);

  // 2. Policy + dry-run
  mark("policy", "Plain-English policy");
  const policyBox = page.getByLabel("Spending and billing policy");
  await scrollTo(policyBox);
  await clickHuman(policyBox, { after: 150 });
  await policyBox.fill("");
  await policyBox.focus();
  await page.keyboard.type(TIGHT_POLICY, { delay: 8 });
  const simResp = page.waitForResponse(
    (r) => r.url().includes("/api/policy/simulate") && r.request().method() === "POST",
    { timeout: 40000 }
  );
  await clickHuman(page.getByRole("button", { name: /Dry-run this rule/i }));
  const sim = await simResp;
  if (!sim.ok()) throw new Error(`Dry-run failed: ${sim.status()}`);
  await waitForText("Dry-run only", 15000);
  await scrollTo(page.getByText("Innovation · policy dry-run"));
  await sleep(900);
  await scrollTo(policyBox);
  await policyBox.fill(POLICY_TEXT);
  const compileResp = page.waitForResponse(
    (r) => r.url().includes("/api/policy") && r.request().method() === "PUT",
    { timeout: 40000 }
  );
  await clickHuman(page.getByRole("button", { name: /Compile & save/i }));
  const pol = await compileResp;
  if (!pol.ok()) throw new Error(`Policy compile failed: ${pol.status()}`);
  await waitForText("Compiled rules", 20000);
  await waitForText("gpt-4o-mini", 10000);
  await scrollTo(".compiled");
  await sleep(600);
  await scrollTo("section.budget");
  await moveTo("section.budget");
  await holdFor("policy");

  // 3. Held purchase
  mark("allowed", "Hold · Northline icon pack");
  await scrollTo(page.getByText("Hold: $35 icon pack"));
  await clickHuman(page.getByText("Hold: $35 icon pack"));
  const proposeResp = page.waitForResponse(
    (r) => r.url().endsWith("/api/purchases") && r.request().method() === "POST",
    { timeout: 40000 }
  );
  await clickHuman(page.getByRole("button", { name: /Propose purchase/i }));
  const proposed = await proposeResp;
  if (!proposed.ok()) throw new Error(`Propose failed: ${proposed.status()}`);
  await page.locator("section.decision").waitFor({ timeout: 20000 });
  await scrollTo("section.decision");
  await moveTo("section.decision");
  const decisionText = await page.locator("section.decision").innerText();
  console.log("DECISION", decisionText.replace(/\s+/g, " ").slice(0, 240));
  await holdFor("allowed");

  // 4. 403
  mark("no_token", "No token, no PayPal");
  const forbidResp = page.waitForResponse(
    (r) => r.url().includes("/execute") && r.request().method() === "POST",
    { timeout: 20000 }
  );
  await clickHuman(page.getByRole("button", { name: /Call capture with no token/i }));
  const forbid = await forbidResp;
  console.log("FORBIDDEN status", forbid.status());
  await page.locator("section.decision .issues").waitFor({ timeout: 10000 });
  await scrollTo("section.decision .issues");
  await moveTo("section.decision .issues");
  await holdFor("no_token");

  // 5. Approve
  mark("approve", "Approve this exact order");
  await clickHuman(page.getByRole("button", { name: /Approve this exact order/i }));
  await page.locator(".modal").waitFor({ timeout: 10000 });
  await moveTo(".modal");
  await sleep(700);
  const execResp = page.waitForResponse(
    (r) => r.url().includes("/execute") && r.request().method() === "POST",
    { timeout: 60000 }
  );
  await clickHuman(page.getByRole("button", { name: /Yes, I approve/i }));
  const executed = await execResp;
  if (!executed.ok()) {
    const body = await executed.text();
    throw new Error(`Execute failed: ${executed.status()} ${body.slice(0, 200)}`);
  }
  const purchase = await executed.json();
  outcome.paypalOrder = purchase.paypal?.orderId || null;
  outcome.paypalStatus = purchase.paypal?.status || purchase.status || null;
  outcome.paypalCapture = purchase.paypal?.captureId || null;
  console.log("ORDER", outcome.paypalOrder, outcome.paypalStatus, purchase.status);
  await page.locator("section.decision .result, section.decision .status").first().waitFor({ timeout: 15000 });
  await scrollTo("section.decision");
  await holdFor("approve");

  const needsPayer =
    purchase.status === "AWAITING_PAYER" ||
    (purchase.paypal?.approveUrl && purchase.status !== "COMPLETED");
  if (purchase.status === "COMPLETED") {
    mark("paypal", "PayPal order completed");
    await moveTo("section.decision .result");
    outcome.payerApproved = true;
    await holdFor("paypal_completed", 0.4);
  } else if (needsPayer && purchase.paypal?.approveUrl) {
    mark("paypal", "PayPal sandbox Orders v2");
    const link = page.getByRole("link", { name: /Approve in PayPal sandbox/i });
    await scrollTo(link);
    await moveTo(link);
    await sleep(400);
    const ok = await approvePaypalIfPossible(purchase.paypal.approveUrl);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("h1", { timeout: 20000 });
    await installCursor();
    await sleep(800);
    const firstPurchase = page.locator(".inv").first();
    if (await firstPurchase.count()) {
      await clickHuman(firstPurchase, { after: 600 });
    }
    const hasDecision = await page.locator("section.decision").count();
    if (!hasDecision) {
      outcome.notes.push("Purchase list empty after returning from PayPal (ephemeral store). Continuing.");
    }
    if (ok && hasDecision) {
      const capBtn = page.getByRole("button", { name: /Capture now/i });
      if (await capBtn.count()) {
        const capResp = page.waitForResponse(
          (r) => r.url().includes("/capture") && r.request().method() === "POST",
          { timeout: 40000 }
        );
        await clickHuman(capBtn);
        try {
          const cap = await capResp;
          if (cap.ok()) {
            const after = await cap.json();
            outcome.paypalStatus = after.paypal?.status || after.status;
            outcome.paypalCapture = after.paypal?.captureId || outcome.paypalCapture;
            outcome.paypalOrder = after.paypal?.orderId || outcome.paypalOrder;
            console.log("CAPTURE", outcome.paypalStatus, outcome.paypalCapture);
          } else {
            outcome.notes.push(`Capture returned ${cap.status()}`);
          }
        } catch {
          outcome.notes.push("Capture request did not finish.");
        }
      }
    }
    if (await page.locator("section.decision").count()) {
      await scrollTo("section.decision");
      if (await page.locator("section.decision .result").count()) await moveTo("section.decision .result");
    }
    const id = outcome.paypalCapture || outcome.paypalStatus === "COMPLETED" ? "paypal_completed" : "paypal_pending";
    await holdFor(id, 0.4);
  } else {
    mark("paypal", "PayPal order pending");
    await moveTo("section.decision .result");
    await holdFor("paypal_pending", 0.4);
  }

  // 6. Blocked gift card
  mark("blocked", "Blocked · gift card");
  await scrollTo(page.getByText("Blocked: $200 gift card"));
  await clickHuman(page.getByText("Blocked: $200 gift card"));
  const giftResp = page.waitForResponse(
    (r) => r.url().endsWith("/api/purchases") && r.request().method() === "POST",
    { timeout: 40000 }
  );
  await clickHuman(page.getByRole("button", { name: /Propose purchase/i }));
  const gift = await giftResp;
  if (!gift.ok()) throw new Error(`Gift propose failed: ${gift.status()}`);
  await page.locator("section.decision").waitFor({ timeout: 20000 });
  await scrollTo("section.decision");
  await moveTo("section.decision");
  await holdFor("blocked");

  // 7. Prompt injection (product page — not the gift-card row)
  mark("injection", "Prompt injection blocked");
  await scrollTo(page.getByText("Attack test: injected product page"));
  await clickHuman(page.getByText("Attack test: injected product page"));
  await page.getByLabel("Untrusted context").waitFor({ timeout: 8000 });
  await scrollTo(page.getByLabel("Untrusted context"));
  await sleep(1000);
  const atkResp = page.waitForResponse(
    (r) => r.url().endsWith("/api/purchases") && r.request().method() === "POST",
    { timeout: 40000 }
  );
  await clickHuman(page.getByRole("button", { name: /Propose purchase/i }));
  const atk = await atkResp;
  if (!atk.ok()) throw new Error(`Attack propose failed: ${atk.status()}`);
  await page.locator("section.decision").waitFor({ timeout: 20000 });
  await scrollTo("section.decision");
  await moveTo("section.decision");
  await holdFor("injection");

  // 8. Bill
  mark("bill", "Bill · money in");
  await clickHuman(page.locator("nav.tabs button").nth(1));
  await page.getByLabel("Describe the work").waitFor({ timeout: 15000 });
  await typeHuman(page.getByLabel("Describe the work"), INVOICE_PROMPT, 12);
  const draftResp = page.waitForResponse(
    (r) => r.url().endsWith("/api/drafts") && r.request().method() === "POST",
    { timeout: 50000 }
  );
  await clickHuman(page.getByRole("button", { name: /Draft invoice/i }));
  const drafted = await draftResp;
  if (!drafted.ok()) throw new Error(`Draft invoice failed: ${drafted.status()}`);
  await waitForText("Review", 20000);
  await scrollTo(page.getByRole("heading", { name: /Review/i }));
  await sleep(800);
  await clickHuman(page.getByRole("button", { name: /Approve & create PayPal draft/i }));
  await page.locator(".modal").waitFor({ timeout: 10000 });
  const createResp = page.waitForResponse(
    (r) => r.url().includes("/execute") && r.request().method() === "POST",
    { timeout: 60000 }
  );
  await clickHuman(page.getByRole("button", { name: /Yes, I approve/i }));
  const created = await createResp;
  if (!created.ok()) {
    const body = await created.text();
    throw new Error(`Invoice create failed: ${created.status()} ${body.slice(0, 200)}`);
  }
  const invoice = await created.json();
  outcome.invoiceId = invoice.paypal?.invoiceId || null;
  outcome.invoiceStatus = invoice.paypal?.status || invoice.status || null;
  console.log("INVOICE", outcome.invoiceId, outcome.invoiceStatus, invoice.status);
  mark("bill_result", "PayPal invoice created");
  await scrollTo(page.locator(".result").first());
  await holdFor("bill_draft", 0.35, "bill");

  // 9. Invoice Intake (poisoned notes) — back on Spend
  mark("intake", "Invoice Intake");
  await clickHuman(page.locator("nav.tabs button").nth(0));
  await page.getByRole("heading", { name: /Receive a seller invoice/i }).waitFor({ timeout: 15000 });
  await scrollTo(page.getByText("Poisoned notes"));
  await clickHuman(page.getByText("Poisoned notes"));
  await sleep(400);
  const intakeResp = page.waitForResponse(
    (r) => r.url().includes("/api/inbox") && r.request().method() === "POST",
    { timeout: 40000 }
  );
  await clickHuman(page.getByRole("button", { name: /Intake invoice/i }));
  const incoming = await intakeResp;
  if (!incoming.ok()) throw new Error(`Intake failed: ${incoming.status()}`);
  const incomingBody = await incoming.json();
  console.log("INTAKE", incomingBody.decision?.outcome, incomingBody.injectionDetected, incomingBody.status);
  await page.locator("section.decision").waitFor({ timeout: 20000 });
  await scrollTo("section.decision");
  await moveTo("section.decision");
  await holdFor("intake");

  // 10. Hash-chained audit
  mark("audit", "Hash-chained audit");
  await scrollTo(page.getByRole("heading", { name: /Hash-chained audit/i }));
  const verifyResp = page.waitForResponse(
    (r) => r.url().includes("/api/audit/verify") && (r.request().method() === "GET" || r.request().method() === "POST"),
    { timeout: 20000 }
  );
  await clickHuman(page.getByRole("button", { name: /Verify chain/i }));
  try {
    const v = await verifyResp;
    const body = v.ok() ? await v.json() : {};
    console.log("VERIFY", v.status(), body.ok, body.checked);
  } catch {
    outcome.notes.push("Audit verify did not finish.");
  }
  await sleep(800);
  await moveTo(page.locator(".audit").first());
  await holdFor("audit");

  // 11. Close
  mark("close", "Tech · Design · Impact · Innovation");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(500);
  await moveTo("header h1");
  await holdFor("close", 0.4);
  await sleep(500);
} catch (e) {
  errors.push(String(e && e.stack ? e.stack : e));
  console.error("RECORD_ERROR", String(e && e.message ? e.message : e));
  try {
    await page.screenshot({ path: path.join(WORK, "record-error.png"), fullPage: true });
  } catch {}
} finally {
  const video = page.video();
  chapters.push({ id: "end", title: "end", at: Number(sec().toFixed(2)) });
  await writeFile(path.join(WORK, "chapters.json"), JSON.stringify({ chapters, outcome, errors, durationSec: sec() }, null, 2));
  await context.close();
  const videoPath = video ? await video.path() : null;
  if (videoPath) {
    const dest = path.join(WORK, "raw-demo.webm");
    await writeFile(path.join(WORK, "raw-video-path.txt"), dest);
    await copyFile(videoPath, dest);
    console.log("VIDEO", dest);
  } else {
    console.log("VIDEO missing");
  }
  await browser.close();
  if (errors.length) {
    console.error("ERRORS", errors.join("\n"));
    process.exitCode = 1;
  }
}
