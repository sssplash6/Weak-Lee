// Server-only: outbound email through Resend's HTTP API (a plain POST — no
// SDK dependency). Dormant until RESEND_API_KEY is set, so email-sending
// features can ship ahead of the keys: without a key every send is skipped
// quietly. A failed send is logged and swallowed — mail is a side channel and
// must never take the action that triggered it down with it.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** The From header; the domain must be verified in Resend. */
function fromAddress(): string {
  return process.env.RESEND_FROM ?? "FreshWeek <reports@freshweek.org>";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // keys not configured yet — feature stays dormant

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      console.error(
        `sendEmail: Resend responded ${res.status}: ${await res
          .text()
          .catch(() => "")}`,
      );
    }
  } catch (e) {
    console.error("sendEmail failed", e);
  }
}
