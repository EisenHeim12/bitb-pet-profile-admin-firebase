// src/lib/whatsapp.ts

/**
 * Normalize a raw phone string into E.164 format, returning +<digits> or null.
 * - Does NOT write anywhere (safe for runtime-only use).
 * - Uses a default country code for local-format Indian numbers (10 digits, or 0 + 10 digits).
 */
export function normalizeToE164(
  raw: string | null | undefined,
  defaultCountryCode = "91"
): string | null {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Keep only digits (and handle + / 00 prefixes separately)
  const digitsOnly = trimmed.replace(/\D/g, "");

  // Case 1: starts with +
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (!isValidE164DigitLength(digits)) return null;
    return `+${digits}`;
  }

  // Case 2: starts with 00 (international dialing prefix)
  if (digitsOnly.startsWith("00")) {
    const digits = digitsOnly.slice(2);
    if (!isValidE164DigitLength(digits)) return null;
    return `+${digits}`;
  }

  // Case 3: no prefix (+/00). Interpret by length.
  const len = digitsOnly.length;

  // 10 digits => assume local (India by default)
  if (len === 10) {
    const cc = sanitizeCountryCode(defaultCountryCode);
    const full = `${cc}${digitsOnly}`;
    if (!isValidE164DigitLength(full)) return null;
    return `+${full}`;
  }

  // 11 digits starting with 0 => strip leading 0, assume local
  if (len === 11 && digitsOnly.startsWith("0")) {
    const cc = sanitizeCountryCode(defaultCountryCode);
    const national = digitsOnly.slice(1);
    const full = `${cc}${national}`;
    if (!isValidE164DigitLength(full)) return null;
    return `+${full}`;
  }

  // 11–15 digits => assume it already includes country code but missing +
  if (len >= 11 && len <= 15) {
    if (!isValidE164DigitLength(digitsOnly)) return null;
    return `+${digitsOnly}`;
  }

  return null;
}

/**
 * Builds a WhatsApp wa.me link from an E.164 phone number (+<digits>).
 * Returns null if the number cannot be converted safely.
 */
export function buildWhatsAppLink(
  e164: string | null | undefined,
  text?: string
): string | null {
  if (!e164) return null;

  // wa.me expects digits only (no +, no spaces)
  const digits = String(e164).replace(/\D/g, "");
  if (!isValidE164DigitLength(digits)) return null;

  const base = `https://wa.me/${digits}`;
  if (!text) return base;

  return `${base}?text=${encodeURIComponent(text)}`;
}

function sanitizeCountryCode(cc: string): string {
  // Keep digits only; prevents " +91 " type inputs from breaking.
  const digits = String(cc || "").replace(/\D/g, "");
  return digits || "91";
}

function isValidE164DigitLength(digits: string): boolean {
  // E.164 max is 15 digits. Minimum varies; 8 is a safe practical lower bound for this app.
  return digits.length >= 8 && digits.length <= 15;
}
