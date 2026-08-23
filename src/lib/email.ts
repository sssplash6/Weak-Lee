// Server-only: outbound email through Resend's HTTP API (a plain POST — no
// SDK dependency). Dormant until RESEND_API_KEY is set, so email-sending
// features can ship ahead of the keys: without a key every send is skipped
// quietly. A failed send is logged and swallowed — mail is a side channel and
// must never take the action that triggered it down with it — but the outcome
// is RETURNED, so a caller that records "reminder sent" can tell whether it
// actually was. Ignoring the result keeps the old fire-and-forget behaviour.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** The From header; the domain must be verified in Resend. */
function fromAddress(): string {
  return process.env.RESEND_FROM ?? "FreshWeek <reports@freshweek.org>";
}

/** Resolves true if it went out (or email is switched off), false on failure. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  /** Optional file attachments (e.g. the payroll invoice PDF). Bytes are
   * base64-encoded into the JSON body, per Resend's HTTP API. */
  attachments?: { filename: string; bytes: Uint8Array }[];
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  // Keys not configured yet — the feature is dormant by choice, not broken,
  // so this counts as success: there is nothing here worth retrying.
  if (!key) return true;

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
        ...(opts.attachments && opts.attachments.length > 0
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.bytes).toString("base64"),
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      console.error(
        `sendEmail: Resend responded ${res.status}: ${await res
          .text()
          .catch(() => "")}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendEmail failed", e);
    return false;
  }
}
