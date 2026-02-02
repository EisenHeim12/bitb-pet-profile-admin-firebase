"use client";

import { normalizeToE164 } from "@/lib/whatsapp";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  deleteDoc,
  doc,
  getDocs,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { z } from "zod";
import { cn } from "@/lib/utils";

const ClientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type Client = {
  id: string;
  name: string;
  phone?: string; // raw user input
  phoneE164?: string; // derived (Option A)
  email?: string;
  address?: string;
  notes?: string;
  createdAt?: Timestamp;
};

function stripUndefined<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

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

export default function ClientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const addCardRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [err, setErr] = useState<string | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const qy = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    return onSnapshot(qy, (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
  }, []);

  // ✅ If opened via /clients?new=1, jump to "Add client" + focus name
  useEffect(() => {
    const isNew = searchParams.get("new") === "1";
    if (!isNew) return;

    // Wait a tick so refs exist
    requestAnimationFrame(() => {
      addCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Small delay ensures focus happens after scroll starts
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 150);
    });
  }, [searchParams]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;

    return clients.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(needle) ||
        (c.phone ?? "").toLowerCase().includes(needle) ||
        (c.phoneE164 ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle)
    );
  }, [clients, q]);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const parsed = ClientSchema.safeParse({
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });

    if (!parsed.success) {
      setErr("Name is required.");
      return;
    }

    setSaving(true);
    try {
      const derivedE164 =
        parsed.data.phone && parsed.data.phone.trim()
          ? normalizeToE164(parsed.data.phone.trim(), "91")
          : null;

      const payload = stripUndefined({
        ...parsed.data,
        // Option A: store derived phoneE164 but NEVER overwrite raw phone
        phoneE164: derivedE164 || undefined,
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, "clients"), payload);

      setForm({ name: "", phone: "", email: "", address: "", notes: "" });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create client");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient(c: Client) {
    setListErr(null);

    const ok1 = window.confirm(`Delete this client${c?.name ? `: ${c.name}` : ""}? This cannot be undone.`);
    if (!ok1) return;

    const typed = window.prompt("Type DELETE to confirm deletion:");
    if (typed !== "DELETE") return;

    setDeletingId(c.id);
    try {
      // Safety: do NOT allow deleting a client who still has pets
      const petSnap = await getDocs(query(collection(db, "pets"), where("clientId", "==", c.id), limit(1)));
      if (!petSnap.empty) {
        window.alert("Cannot delete client: they still have pets. Delete/transfer pets first.");
        return;
      }

      await deleteDoc(doc(db, "clients", c.id));
      // Snapshot will auto-refresh
    } catch (e: any) {
      setListErr(e?.message ?? "Failed to delete client.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-neutral-600 mt-1">Add and manage pet parents.</p>
        </div>

        <Link className="text-sm rounded-lg border px-3 py-2 hover:bg-neutral-50" href="/dashboard">
          Dashboard
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <div className="border rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">All clients</h2>
            <input
              className="border rounded-lg p-2 text-sm w-64"
              placeholder="Search name/phone/email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {listErr ? <p className="text-sm text-red-600 mt-3">{listErr}</p> : null}

          <div className="mt-3 divide-y">
            {filtered.length === 0 ? (
              <p className="text-sm text-neutral-600 py-6">No clients yet.</p>
            ) : (
              filtered.map((c) => {
                const telHref = c.phoneE164 ? `tel:${c.phoneE164}` : buildTelHref(c.phone);
                const mailHref = buildMailtoHref(c.email);

                const displayPhone = (c.phone ?? c.phoneE164 ?? "").trim() || "—";
                const displayEmail = (c.email ?? "").trim() || "—";

                const openClient = () => router.push(`/clients/${c.id}`);

                return (
                  <div
                    key={c.id}
                    className={cn(
                      "py-3 px-2 rounded-lg hover:bg-neutral-50 cursor-pointer",
                      "focus:outline-none focus:ring-2 focus:ring-black/20"
                    )}
                    role="link"
                    tabIndex={0}
                    onClick={openClient}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openClient();
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>

                        <p className="text-xs text-neutral-600 mt-0.5 truncate">
                          {telHref ? (
                            <a className="underline" href={telHref} onClick={(e) => e.stopPropagation()}>
                              {displayPhone}
                            </a>
                          ) : (
                            <span>{displayPhone}</span>
                          )}

                          <span>{" • "}</span>

                          {mailHref ? (
                            <a className="underline" href={mailHref} onClick={(e) => e.stopPropagation()}>
                              {displayEmail}
                            </a>
                          ) : (
                            <span>{displayEmail}</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative group">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs border hover:bg-white transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              openClient();
                            }}
                            aria-label="Open client"
                            title="Open"
                          >
                            ✏️
                          </button>
                          <span className="pointer-events-none absolute -top-9 right-0 opacity-0 group-hover:opacity-100 transition text-[11px] bg-black text-white px-2 py-1 rounded-md shadow">
                            Open
                          </span>
                        </div>

                        <div className="relative group">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs border bg-white transition transform hover:scale-105 hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClient(c);
                            }}
                            aria-label="Delete client"
                            disabled={deletingId === c.id}
                            title="Delete"
                          >
                            🗑️
                          </button>
                          <span className="pointer-events-none absolute -top-9 right-0 opacity-0 group-hover:opacity-100 transition text-[11px] bg-red-600 text-white px-2 py-1 rounded-md shadow">
                            Delete
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div ref={addCardRef} className="border rounded-2xl p-4">
          <h2 className="font-semibold">Add client</h2>
          <form onSubmit={createClient} className="mt-3 space-y-2">
            <Field label="Name *">
              <input
                ref={nameInputRef}
                className="w-full border rounded-lg p-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field label="Phone">
              <input
                className="w-full border rounded-lg p-2"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>

            <Field label="Email">
              <input
                className="w-full border rounded-lg p-2"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>

            <Field label="Address">
              <input
                className="w-full border rounded-lg p-2"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>

            <Field label="Notes">
              <textarea
                className="w-full border rounded-lg p-2"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>

            {err ? <p className="text-sm text-red-600">{err}</p> : null}

            <button className="w-full rounded-lg bg-black text-white py-2 disabled:opacity-60" disabled={saving}>
              {saving ? "Creating..." : "Create client"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
