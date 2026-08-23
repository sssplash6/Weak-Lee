// Server-only: encryption for the one field in this app that is worth stealing
// on its own — the payee's card number.
//
// Everything else about a pay request is internal business data. A full PAN is
// not: it has value to whoever reads the database, a backup of it, or a copy of
// it restored somewhere less guarded. Finance genuinely needs the whole number
// to make the transfer (see paymentFull), so it can't be truncated the way an
// invoice can — it's encrypted at rest instead and decrypted only on the gated
// server pages that move the money.
//
// Do NOT import this from a client component: payrollTypes.ts is safe to share
// with the browser, this file is not.

import crypto from "node:crypto";
import { parsePaymentDetails, type PaymentDetails } from "@/lib/payrollTypes";

/** Marks a stored value as ciphertext, and versions the format. */
const PREFIX = "enc.v1.";

/**
 * The AES key, derived from PAYROLL_CARD_KEY. Hashed rather than used raw so
 * the operator can set any high-entropy string — including a Render
 * `generateValue` secret — instead of having to produce exactly 32 bytes of
 * base64. Returns null when unset, which callers must treat as "refuse", never
 * as "store it in the clear".
 */
function key(): Buffer | null {
  const secret = process.env.PAYROLL_CARD_KEY;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

/** Whether card numbers can be stored at all. */
export function cardEncryptionReady(): boolean {
  return key() !== null;
}

/** Encrypt a card number for storage. Throws if no key is configured. */
export function encryptCard(plain: string): string {
  const k = key();
  if (!k) {
    throw new Error("PAYROLL_CARD_KEY is not set — refusing to store a card");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX + [iv, tag, body].map((b) => b.toString("base64url")).join(".")
  );
}

/**
 * Recover a stored card number. A value without the prefix is returned as-is:
 * rows written before this existed hold plaintext, and losing the ability to
 * pay those people would be a worse outcome than the exposure already is.
 * Null means it was encrypted and couldn't be read — wrong key, or tampering.
 */
export function decryptCard(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return stored;
  const k = key();
  if (!k) return null;
  try {
    const [iv, tag, body] = stored.slice(PREFIX.length).split(".");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      k,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (e) {
    console.error("decryptCard: stored card number could not be read", e);
    return null;
  }
}

/**
 * Parse a stored paymentDetails column AND decrypt the card number — what the
 * server pages want. `parsePaymentDetails` stays the pure, browser-safe parser
 * and hands back whatever is stored, ciphertext included.
 */
export function readPaymentDetails(v: unknown): PaymentDetails {
  const details = parsePaymentDetails(v);
  if (!details.cardNumber) return details;
  return {
    ...details,
    cardNumber: decryptCard(details.cardNumber) ?? undefined,
  };
}
