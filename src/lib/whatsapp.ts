export function normalizePhone(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";

  // Keep + if present, strip everything else to digits
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");

  const digits = raw.replace(/\D/g, "");

  // India defaults
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;

  return digits ? `+${digits}` : "";
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const norm = normalizePhone(phone);
  const number = norm.replace("+", ""); // wa.me expects no +
  const msg = encodeURIComponent(text ?? "");
  return `https://wa.me/${number}?text=${msg}`;
}
