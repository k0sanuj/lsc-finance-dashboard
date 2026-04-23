/**
 * Shared email sender. Provider-agnostic facade — swap by editing one
 * function. Currently supports Resend (production) and a dev-log fallback
 * that just prints to stderr so local development never hits the wire.
 *
 * Env vars:
 *   EMAIL_PROVIDER          "resend" | "log" (default: "log")
 *   RESEND_API_KEY          required when provider=resend
 *   EMAIL_FROM              "LSC Ops <ops@yourdomain.com>" (required)
 *   EMAIL_REPLY_TO          optional — if unset, replies go to EMAIL_FROM
 *
 * The module never throws on send failure — it returns { ok: false, error }
 * so callers can decide (most callers log and continue; this keeps email
 * outages from blocking DB writes that already succeeded).
 */

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** Plain-text body. Required. */
  text: string;
  /** Optional HTML body. If omitted, text is sent as plain text only. */
  html?: string;
  /** Override EMAIL_REPLY_TO for this send (used for submitter notifications). */
  replyTo?: string;
  /** Logical label for cost/debugging. Never shown to recipients. */
  purpose: string;
};

export type SendEmailResult = {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
};

function provider(): "resend" | "log" {
  const v = (process.env.EMAIL_PROVIDER ?? "log").toLowerCase();
  return v === "resend" ? "resend" : "log";
}

function from(): string {
  return (
    process.env.EMAIL_FROM ?? "LSC Ops <noreply@localhost>"
  );
}

function normalizeRecipients(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

async function sendViaResend(input: SendEmailInput, to: string[]): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      ok: false,
      provider: "resend",
      error: "RESEND_API_KEY is not set",
    };
  }

  const body: Record<string, unknown> = {
    from: from(),
    to,
    subject: input.subject,
    text: input.text,
  };
  if (input.html) body.html = input.html;
  const replyTo = input.replyTo ?? process.env.EMAIL_REPLY_TO;
  if (replyTo) body.reply_to = replyTo;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        provider: "resend",
        error: payload.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, provider: "resend", messageId: payload.id };
  } catch (err) {
    return {
      ok: false,
      provider: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function sendViaLog(input: SendEmailInput, to: string[]): SendEmailResult {
  // Dev fallback — log to stderr with a clear header so it shows up in
  // `vercel logs` and local terminal output.
  const stamp = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(
    `\n[email:log] ${stamp} purpose=${input.purpose}\n` +
      `  to:      ${to.join(", ")}\n` +
      `  from:    ${from()}\n` +
      `  subject: ${input.subject}\n` +
      `  body:\n${input.text
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n")}\n`
  );
  return { ok: true, provider: "log", messageId: `log-${Date.now()}` };
}

/** Send an email. Never throws — failures are returned as { ok: false }. */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const to = normalizeRecipients(input.to);
  if (to.length === 0) {
    return {
      ok: false,
      provider: provider(),
      error: "No valid recipient addresses",
    };
  }
  try {
    if (provider() === "resend") {
      return await sendViaResend(input, to);
    }
    return sendViaLog(input, to);
  } catch (err) {
    return {
      ok: false,
      provider: provider(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
