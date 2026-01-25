"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { z } from "zod";

const PetSchema = z.object({
  name: z.string().min(1),
  species: z.string().default("Dog"),
  breed: z.string().optional(),
  sex: z.string().optional(),
  dob: z.string().optional(),
  microchipNo: z.string().optional(),
  temperament: z.string().optional(),
  notes: z.string().optional(),
});

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [client, setClient] = useState<any>(null);
  const [pets, setPets] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    species: "Dog",
    breed: "",
    sex: "",
    dob: "",
    microchipNo: "",
    temperament: "",
    notes: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadClient() {
      const ref = doc(db, "clients", clientId);
      const snap = await getDoc(ref);
      setClient(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }
    loadClient();

    const qPets = query(
      collection(db, "pets"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(qPets, (snap) => {
      setPets(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
  }, [clientId]);

  const header = useMemo(() => {
    if (!client) return "Client";
    return client.name ?? "Client";
  }, [client]);

  async function createPet(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const parsed = PetSchema.safeParse({
      name: form.name.trim(),
      species: form.species.trim() || "Dog",
      breed: form.breed.trim() || undefined,
      sex: form.sex.trim() || undefined,
      dob: form.dob.trim() || undefined,
      microchipNo: form.microchipNo.trim() || undefined,
      temperament: form.temperament.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
    if (!parsed.success) {
      setErr("Pet name is required.");
      return;
    }
    setSaving(true);
    try {
      const dobDate = parsed.data.dob ? new Date(parsed.data.dob) : null;

      await addDoc(collection(db, "pets"), {
        clientId,
        ...parsed.data,
        dob: dobDate ? Timestamp.fromDate(dobDate) : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      setForm({ name: "", species: "Dog", breed: "", sex: "", dob: "", microchipNo: "", temperament: "", notes: "" });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create pet");
    } finally {
      setSaving(false);
    }
  }

  if (client === null) {
    return (
      <main className="p-6">
        <Link className="text-sm underline" href="/clients">← Back</Link>
        <p className="mt-4">Client not found.</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="text-sm underline" href="/clients">← Back</Link>
          <h1 className="text-2xl font-semibold mt-2">{header}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            {client?.phone ?? "—"} • {client?.email ?? "—"}
          </p>
        </div>

        <Link className="text-sm underline" href="/pets">All pets</Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Pets</h2>
          <div className="mt-3 space-y-2">
            {pets.length === 0 ? (
              <p className="text-sm text-neutral-600">No pets yet.</p>
            ) : pets.map(p => (
              <Link key={p.id} className="block border rounded-xl p-3 hover:bg-neutral-50" href={`/pets/${p.id}`}>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {p.species ?? "Dog"} • {p.breed ?? "—"} • Microchip {p.microchipNo ?? "—"}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Add pet</h2>
          <form onSubmit={createPet} className="mt-3 space-y-2">
            <Field label="Pet name *">
              <input className="w-full border rounded-lg p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Species">
                <input className="w-full border rounded-lg p-2" value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} />
              </Field>
              <Field label="Breed">
                <input className="w-full border rounded-lg p-2" value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Sex">
                <select className="w-full border rounded-lg p-2" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </Field>
              <Field label="Birthdate">
                <input type="date" className="w-full border rounded-lg p-2" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
              </Field>
            </div>
            <Field label="Microchip #">
              <input className="w-full border rounded-lg p-2" value={form.microchipNo} onChange={(e) => setForm({ ...form, microchipNo: e.target.value })} />
            </Field>
            <Field label="Temperament (free text/tags)">
              <input className="w-full border rounded-lg p-2" value={form.temperament} onChange={(e) => setForm({ ...form, temperament: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className="w-full border rounded-lg p-2" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>

            {err ? <p className="text-sm text-red-600">{err}</p> : null}

            <button className="w-full rounded-lg bg-black text-white py-2 disabled:opacity-60" disabled={saving}>
              {saving ? "Creating..." : "Create pet"}
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
