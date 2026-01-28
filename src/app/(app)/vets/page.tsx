"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDoc, collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { normalizeToE164 } from "@/lib/whatsapp";

const VetSchema = z.object({
  name: z.string().min(1),
  clinic: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

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

export default function VetsPage() {
  const [vets, setVets] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    name: "",
    clinic: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const qy = query(collection(db, "vets"), orderBy("createdAt", "desc"));
    return onSnapshot(qy, (snap) =>
      setVets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vets;
    return vets.filter(
      (v) =>
        (v.name ?? "").toLowerCase().includes(needle) ||
        (v.clinic ?? "").toLowerCase().includes(needle) ||
        (v.phone ?? "").toLowerCase().includes(needle) ||
        (v.email ?? "").toLowerCase().includes(needle)
    );
  }, [vets, q]);

  async function createVet(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const parsed = VetSchema.safeParse({
      name: form.name.trim(),
      clinic: form.clinic.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });

    if (!parsed.success) {
      setErr("Vet name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = stripUndefined({
        ...parsed.data,
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, "vets"), payload);

      setForm({ name: "", clinic: "", phone: "", email: "", address: "", notes: "" });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create vet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Veterinarians</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Save vet contacts and link them to pets/visits.
          </p>
        </div>
        <Link className="text-sm underline" href="/dashboard">
          Dashboard
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <div className="border rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">All vets</h2>
            <input
              className="border rounded-lg p-2 text-sm w-64"
              placeholder="Search vets"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="mt-3 divide-y">
            {filtered.length === 0 ? (
              <p className="text-sm text-neutral-600 py-6">No vets yet.</p>
            ) : (
              filtered.map((v) => {
                const telHref = buildTelHref(v.phone);
                const mailHref = buildMailtoHref(v.email);

                return (
                  <div key={v.id} className={cn("py-3 px-2 rounded-lg hover:bg-neutral-50")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{v.name}</p>
                        <p className="text-xs text-neutral-600 mt-0.5 truncate">{v.clinic ?? "—"}</p>

                        <p className="text-xs text-neutral-600 mt-1 truncate">
                          {telHref ? (
                            <a className="underline" href={telHref}>
                              {v.phone}
                            </a>
                          ) : (
                            <span>{v.phone ?? "—"}</span>
                          )}

                          <span>{" • "}</span>

                          {mailHref ? (
                            <a className="underline" href={mailHref}>
                              {v.email}
                            </a>
                          ) : (
                            <span>{v.email ?? "—"}</span>
                          )}
                        </p>
                      </div>

                      <span className="text-xs text-neutral-500 shrink-0">Saved</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Add vet</h2>
          <form onSubmit={createVet} className="mt-3 space-y-2">
            <Field label="Name *">
              <input
                className="w-full border rounded-lg p-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Clinic">
              <input
                className="w-full border rounded-lg p-2"
                value={form.clinic}
                onChange={(e) => setForm({ ...form, clinic: e.target.value })}
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
              {saving ? "Creating..." : "Create vet"}
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
