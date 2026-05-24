import "server-only";

type SendMagicLinkInput = {
  to: string;
  fullName: string;
  magicLink: string;
};

type SendMagicLinkResult =
  | { sent: true; provider: "resend" }
  | { sent: false; provider: "none" | "resend"; reason: string };

function getFromAddress() {
  return process.env.AUTH_MAGIC_LINK_FROM ?? "LSC Finance <auth@leaguesportsco.com>";
}

function buildEmailHtml(input: SendMagicLinkInput) {
  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #14213d; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Sign in to LSC Finance</h2>
      <p>Hi ${input.fullName || "there"},</p>
      <p>Use this secure link to sign in to the LSC finance platform. The link expires in 15 minutes and can be used once.</p>
      <p style="margin: 24px 0;">
        <a href="${input.magicLink}" style="background: #0f3b63; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">
          Sign in securely
        </a>
      </p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

export async function sendMagicLinkEmail(input: SendMagicLinkInput): Promise<SendMagicLinkResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { sent: false, provider: "none", reason: "missing_resend_api_key" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [input.to],
      subject: "Your LSC Finance sign-in link",
      html: buildEmailHtml(input)
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      sent: false,
      provider: "resend",
      reason: text.slice(0, 500) || `resend_http_${response.status}`
    };
  }

  return { sent: true, provider: "resend" };
}
