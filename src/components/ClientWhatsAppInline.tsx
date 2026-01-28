"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeToE164, buildWhatsAppLink } from "@/lib/whatsapp";

function buildTelHref(raw?: string | null, defaultCountryCode = "91") {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const e164 = normalizeToE164(s, defaultCountryCode);
  if (e164) return `tel:${e164}`;

  const stripped = s.replace(/[^0-9+]/g, "");
  if (!stripped || stripped === "+") return null;

  return `tel:${stripped}`;
}

function buildMailtoHref(raw?: string | null) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (!s.includes("@")) return null;
  return `mailto:${s}`;
}

export default function ClientWhatsAppInline({
  clientId,
  showLabel = false,
}: {
  clientId: string;
  showLabel?: boolean;
}) {
  const [client, setClient] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!clientId) return;
      try {
        setLoading(true);
        const ref = doc(db, "clients", String(clientId));
        const snap = await getDoc(ref);
        if (cancelled) return;
        setClient(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch {
        if (!cancelled) setClient(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const telHref = useMemo(() => buildTelHref(client?.phone ?? null, "91"), [client?.phone]);
  const mailHref = useMemo(() => buildMailtoHref(client?.email ?? null), [client?.email]);

  const whatsappHref = useMemo(() => {
    const e164 = normalizeToE164(client?.phone ?? null, "91");
    if (!e164) return null;
    // supports either buildWhatsAppLink(e164) or buildWhatsAppLink(e164, text)
    return (buildWhatsAppLink as any)(e164, "");
  }, [client?.phone]);

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      {showLabel ? <span>Client</span> : null}

      <Link className="underline" href={`/clients/${clientId}`}>
        {client?.name ? client.name : loading ? "Loading…" : "Client"}
      </Link>

      {telHref ? (
        <>
          <span>•</span>
          <a className="underline" href={telHref}>
            Call
          </a>
        </>
      ) : null}

      {mailHref ? (
        <>
          <span>•</span>
          <a className="underline" href={mailHref}>
            Email
          </a>
        </>
      ) : null}

      {whatsappHref ? (
        <>
          <span>•</span>
          <a className="underline" href={whatsappHref} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </>
      ) : null}
    </span>
  );
}
