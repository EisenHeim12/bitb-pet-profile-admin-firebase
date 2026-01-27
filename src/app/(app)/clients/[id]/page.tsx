"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
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
import { z } from "zod";

import { db } from "@/lib/firebase";
import { BREEDS, SPECIAL_BREEDS, findBreedRecordByLabel, type BreedType } from "@/lib/breeds";

type Client = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
};

type Pet = {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  breedType?: BreedType;
  breedComponents?: string[];
  microchipNo?: string;
};

const PetSchema = z.object({
  name: z.string().min(1),
  species: z.string().default("Dog"),
  breed: z.string().optional(),
  breedType: z.enum(["Purebred", "Mix-breed", "Cross-breed"]).optional(),
  breedComponents: z.array(z.string().min(1)).optional(),
  sex: z.string().optional(),
  dob: z.string().optional(),
  microchipNo: z.string().optional(),
  temperament: z.string().optional(),
  notes: z.string().optional(),
});

function getBreedTypeFromLabel(label: string): BreedType {
  const v = label.trim();
  if (v === "Mix-breed") return "Mix-breed";
  if (v === "Cross-breed") return "Cross-breed";
  return "Purebred";
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [client, setClient] = useState<Client | null | undefined>(undefined); // undefined=loading, null=not found
  const [pets, setPets] = useState<Pet[]>([]);
  const [form, setForm] = useState({
    name: "",
    species: "Dog",
    breed: "",
    breedType: "Purebred" as BreedType,
    breedComponents: ["", ""] as string[],
    sex: "",
    dob: "",
    microchipNo: "",
    temperament: "",
    notes: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mainBreedOptions = useMemo(() => {
    const seen = new Set<string>();
    const specials = [...SPECIAL_BREEDS].filter((s) => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });

    const rest = BREEDS.map((b) => b.label)
      .filter((l) => {
        if (seen.has(l)) return false;
        seen.add(l);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));

    return [...specials, ...rest];
  }, []);

  const componentBreedOptions = useMemo(() => {
    const exclude = new Set(["Mix-breed", "Cross-breed"]);
    const seen = new Set<string>();
    const opts: string[] = [];

    for (const s of SPECIAL_BREEDS) {
      if (exclude.has(s)) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      opts.push(s);
    }

    for (const b of BREEDS) {
      if (seen.has(b.label)) continue;
      seen.add(b.label);
      opts.push(b.label);
    }

    // Keep Indie first, then sort rest
    const indie = opts.filter((x) => x === "Indie (Indian Pariah)");
    const rest = opts.filter((x) => x !== "Indie (Indian Pariah)").sort((a, b) => a.localeCompare(b));
    return [...indie, ...rest];
  }, []);

  const selectedBreedRecord = useMemo(() => {
    const label = form.breed.trim();
    if (!label) return undefined;
    return findBreedRecordByLabel(label);
  }, [form.breed]);

  useEffect(() => {
    let unsub = () => {};

    async function load() {
      try {
        const ref = doc(db, "clients", clientId);
        const snap = await getDoc(ref);
        setClient(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Client) : null);
      } catch {
        setClient(null);
      }

      const qPets = query(
        collection(db, "pets"),
        where("clientId", "==", clientId),
        orderBy("createdAt", "desc")
      );

      unsub = onSnapshot(qPets, (snap) => {
        setPets(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: data?.name ?? "—",
              species: data?.species ?? "Dog",
              breed: data?.breed,
              breedType: data?.breedType,
              breedComponents: data?.breedComponents,
              microchipNo: data?.microchipNo,
            } as Pet;
          })
        );
      });
    }

    load();
    return () => unsub();
  }, [clientId]);

  const header = useMemo(() => {
    if (!client) return "Client";
    return client.name ?? "Client";
  }, [client]);

  function onBreedChange(nextBreed: string) {
    const nextType = getBreedTypeFromLabel(nextBreed);
    setForm((prev) => ({
      ...prev,
      breed: nextBreed,
      breedType: nextType,
    }));
  }

  function updateComponent(idx: number, value: string) {
    setForm((prev) => {
      const next = [...prev.breedComponents];
      next[idx] = value;
      return { ...prev, breedComponents: next };
    });
  }

  function addComponentField() {
    setForm((prev) => {
      if (prev.breedComponents.length >= 4) return prev;
      return { ...prev, breedComponents: [...prev.breedComponents, ""] };
    });
  }

  function removeComponentField(idx: number) {
    setForm((prev) => {
      if (prev.breedComponents.length <= 2) return prev;
      const next = prev.breedComponents.filter((_, i) => i !== idx);
      return { ...prev, breedComponents: next };
    });
  }

  async function createPet(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const breedType = getBreedTypeFromLabel(form.breed);
    const components =
      breedType === "Purebred"
        ? []
        : form.breedComponents.map((x) => x.trim()).filter(Boolean);

    if (breedType !== "Purebred" && components.length < 2) {
      setErr("For Mix-breed/Cross-breed, please choose at least 2 component breeds.");
      return;
    }

    const parsed = PetSchema.safeParse({
      name: form.name.trim(),
      species: form.species.trim() || "Dog",
      breed: form.breed.trim() || undefined,
      breedType,
      breedComponents: components.length ? components : undefined,
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

      const payload: any = {
        clientId,
        name: parsed.data.name,
        species: parsed.data.species ?? "Dog",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      if (parsed.data.breed) payload.breed = parsed.data.breed;
      payload.breedType = breedType; // always store
      if (parsed.data.breedComponents?.length) payload.breedComponents = parsed.data.breedComponents;

      if (parsed.data.sex) payload.sex = parsed.data.sex;
      if (dobDate) payload.dob = Timestamp.fromDate(dobDate);
      if (parsed.data.microchipNo) payload.microchipNo = parsed.data.microchipNo;
      if (parsed.data.temperament) payload.temperament = parsed.data.temperament;
      if (parsed.data.notes) payload.notes = parsed.data.notes;

      // Store group metadata when we recognize the breed label
      const rec = parsed.data.breed ? findBreedRecordByLabel(parsed.data.breed) : undefined;
      if (rec?.fci) payload.breedFci = rec.fci;
      if (rec?.akc) payload.breedAkc = rec.akc;
      if (rec?.sources?.length) payload.breedSources = rec.sources;

      await addDoc(collection(db, "pets"), payload);

      setForm({
        name: "",
        species: "Dog",
        breed: "",
        breedType: "Purebred",
        breedComponents: ["", ""],
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

  if (client === undefined) {
    return (
      <main className="p-6">
        <Link className="text-sm underline" href="/clients">
          ← Back
        </Link>
        <p className="mt-4 text-sm text-neutral-600">Loading…</p>
      </main>
    );
  }

  if (client === null) {
    return (
      <main className="p-6">
        <Link className="text-sm underline" href="/clients">
          ← Back
        </Link>
        <p className="mt-4">Client not found.</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="text-sm underline" href="/clients">
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold mt-2">{header}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            {client?.phone ?? "—"} • {client?.email ?? "—"}
          </p>
        </div>

        <Link className="text-sm underline" href="/pets">
          All pets
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Pets</h2>
          <div className="mt-3 space-y-2">
            {pets.length === 0 ? (
              <p className="text-sm text-neutral-600">No pets yet.</p>
            ) : (
              pets.map((p) => {
                const breedDisplay =
                  (p.breedType === "Mix-breed" || p.breedType === "Cross-breed") &&
                  Array.isArray(p.breedComponents) &&
                  p.breedComponents.length
                    ? `${p.breed ?? p.breedType} (${p.breedComponents.join(" × ")})`
                    : p.breed ?? "—";

                return (
                  <Link
                    key={p.id}
                    className="block border rounded-xl p-3 hover:bg-neutral-50"
                    href={`/pets/${p.id}`}
                  >
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {p.species ?? "Dog"} • {breedDisplay} • Microchip {p.microchipNo ?? "—"}
                    </p>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Add pet</h2>

          <form onSubmit={createPet} className="mt-3 space-y-2">
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
                  list="breed-options-main"
                  placeholder="Type to search…"
                  value={form.breed}
                  onChange={(e) => onBreedChange(e.target.value)}
                />
                <datalist id="breed-options-main">
                  {mainBreedOptions.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>

                {selectedBreedRecord?.fci || selectedBreedRecord?.akc ? (
                  <p className="text-xs text-neutral-600 mt-1">
                    {selectedBreedRecord?.fci
                      ? `FCI: Group ${selectedBreedRecord.fci.groupNo} — ${selectedBreedRecord.fci.groupName}`
                      : null}
                    {selectedBreedRecord?.fci && selectedBreedRecord?.akc ? " • " : null}
                    {selectedBreedRecord?.akc ? `AKC: ${selectedBreedRecord.akc.groupName}` : null}
                  </p>
                ) : null}

                {form.breedType !== "Purebred" ? (
                  <div className="mt-2 border rounded-xl p-3 bg-neutral-50 space-y-2">
                    <p className="text-xs text-neutral-600">
                      {form.breedType === "Mix-breed"
                        ? "Mix-breed components (pick at least 2)"
                        : "Cross-breed components (pick at least 2)"}
                    </p>

                    {form.breedComponents.map((val, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          className="w-full border rounded-lg p-2"
                          list="breed-options-components"
                          placeholder={`Component ${idx + 1}`}
                          value={val}
                          onChange={(e) => updateComponent(idx, e.target.value)}
                        />

                        {idx >= 2 ? (
                          <button
                            type="button"
                            className="border rounded-lg px-3 text-sm"
                            onClick={() => removeComponentField(idx)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}

                    <datalist id="breed-options-components">
                      {componentBreedOptions.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>

                    {form.breedComponents.length < 4 ? (
                      <button type="button" className="text-sm underline" onClick={addComponentField}>
                        + Add another component
                      </button>
                    ) : null}
                  </div>
                ) : null}
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

            <Field label="Temperament (free text/tags)">
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

            <button
              className="w-full rounded-lg bg-black text-white py-2 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Creating..." : "Create pet"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
