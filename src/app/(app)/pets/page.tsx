"use client";

import ClientPetWizard from "@/components/ClientPetWizard";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function PetsPage() {
  const router = useRouter();

  const [pets, setPets] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    clientId: "",
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
  const [listErr, setListErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubPets = onSnapshot(
      query(collection(db, "pets"), orderBy("createdAt", "desc")),
      (snap) => {
        setPets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }
    );

    const unsubClients = onSnapshot(
      query(collection(db, "clients"), orderBy("createdAt", "desc")),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        list.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
        setClients(list);
      }
    );

    return () => {
      unsubPets();
      unsubClients();
    };
  }, []);

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [clients]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pets;
    return pets.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(needle) ||
        (p.breed ?? "").toLowerCase().includes(needle) ||
        (p.microchipNo ?? "").toLowerCase().includes(needle) ||
        (clientNameById.get(p.clientId) ?? "").toLowerCase().includes(needle)
    );
  }, [pets, q, clientNameById]);

  async function createPet(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!form.clientId) {
      setErr("Pick a client first.");
      return;
    }
    if (!form.name.trim()) {
      setErr("Pet name is required.");
      return;
    }

    setSaving(true);
    try {
      const dob = form.dob ? Timestamp.fromDate(new Date(form.dob)) : null;

      await addDoc(collection(db, "pets"), {
        clientId: form.clientId,
        name: form.name.trim(),
        species: form.species.trim() || "Dog",
        breed: form.breed.trim() || null,
        sex: form.sex.trim() || null,
        dob,
        microchipNo: form.microchipNo.trim() || null,
        temperament: form.temperament.trim() || null,
        notes: form.notes.trim() || null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setForm({
        clientId: "",
        name: "",
        species: "Dog",
        breed: "",
        sex: "",
        dob: "",
        microchipNo: "",
        temperament: "",
        notes: "",
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create pet");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePet(petId: string, petName?: string) {
    setListErr(null);

    const ok1 = window.confirm(
      `Delete this pet${petName ? `: ${petName}` : ""}? This cannot be undone.`
    );
    if (!ok1) return;

    const typed = window.prompt('Type DELETE to confirm deletion:');
    if (typed !== "DELETE") return;

    setDeletingId(petId);
    try {
      await deleteDoc(doc(db, "pets", petId));
      // Snapshot will auto-refresh the list
    } catch (e: any) {
      setListErr(e?.message ?? "Failed to delete pet.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pets</h1>
          <p className="text-sm text-neutral-600 mt-1">Central list for all pets.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-black text-white px-3 py-2 text-sm"
            onClick={() => setWizardOpen(true)}
          >
            Add client + pet
          </button>
          <Link className="text-sm underline" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <div className="border rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">All pets</h2>
            <input
              className="border rounded-lg p-2 text-sm w-72"
              placeholder="Search name/breed/microchip/client"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {listErr ? <p className="text-sm text-red-600 mt-3">{listErr}</p> : null}

          <div className="mt-3 space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-neutral-600 py-6">No pets yet.</p>
            ) : (
              filtered.map((p) => {
                const openPet = () => router.push(`/pets/${p.id}`);

                return (
                  <div
                    key={p.id}
                    className="border rounded-xl p-3 hover:bg-neutral-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black/20"
                    role="link"
                    tabIndex={0}
                    onClick={openPet}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPet();
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-neutral-600 mt-0.5 truncate">
                          {clientNameById.get(p.clientId) ?? "—"} • {p.breed ?? "—"} • Microchip{" "}
                          {p.microchipNo ?? "—"}
                        </p>
                      </div>

                      {/* Actions (replaces "Open") */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Edit */}
                        <div className="relative group">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs border hover:bg-white transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/pets/${p.id}`);
                            }}
                            aria-label="Edit pet"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <span className="pointer-events-none absolute -top-9 right-0 opacity-0 group-hover:opacity-100 transition text-[11px] bg-black text-white px-2 py-1 rounded-md shadow">
                            Edit
                          </span>
                        </div>

                        {/* Delete */}
                        <div className="relative group">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs border bg-white transition transform hover:scale-105 hover:border-red-300 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePet(p.id, p.name);
                            }}
                            aria-label="Delete pet"
                            disabled={deletingId === p.id}
                            title="Delete"
                          >
                            <span className={deletingId === p.id ? "opacity-50" : ""}>🗑️</span>
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

        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Add pet</h2>

          <form onSubmit={createPet} className="mt-3 space-y-2">
            <Field label="Client *">
              <select
                className="w-full border rounded-lg p-2"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Pet name *">
              <input
                className="w-full border rounded-lg p-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Species">
                <input
                  className="w-full border rounded-lg p-2"
                  value={form.species}
                  onChange={(e) => setForm({ ...form, species: e.target.value })}
                />
              </Field>
              <Field label="Breed">
                <input
                  className="w-full border rounded-lg p-2"
                  value={form.breed}
                  onChange={(e) => setForm({ ...form, breed: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Gender">
                <select
                  className="w-full border rounded-lg p-2"
                  value={form.sex}
                  onChange={(e) => setForm({ ...form, sex: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </Field>
              <Field label="Birthdate">
                <input
                  type="date"
                  className="w-full border rounded-lg p-2"
                  value={form.dob}
                  onChange={(e) => setForm({ ...form, dob: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Microchip #">
              <input
                className="w-full border rounded-lg p-2"
                value={form.microchipNo}
                onChange={(e) => setForm({ ...form, microchipNo: e.target.value })}
              />
            </Field>

            <Field label="Temperament">
              <input
                className="w-full border rounded-lg p-2"
                value={form.temperament}
                onChange={(e) => setForm({ ...form, temperament: e.target.value })}
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
              {saving ? "Creating..." : "Create pet"}
            </button>
          </form>
        </div>
      </div>

      <ClientPetWizard open={wizardOpen} onClose={() => setWizardOpen(false)} clients={clients} />
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
