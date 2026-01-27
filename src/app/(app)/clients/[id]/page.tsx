"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { BREEDS, findBreedRecordByLabel } from "@/lib/breeds";

type BreedType = "Purebred" | "Mix-breed" | "Cross-breed";

const CAT_BREEDS = [
  "Domestic Short Hair (DSH)",
  "Domestic Medium Hair (DMH)",
  "Domestic Long Hair (DLH)",
  "Indian Domestic (Desi)",
  "Persian",
  "Himalayan",
  "Siamese",
  "Bengal",
  "Maine Coon",
  "Ragdoll",
  "British Shorthair",
  "Scottish Fold",
  "Sphynx",
  "Russian Blue",
  "Abyssinian",
  "Birman",
  "Oriental Shorthair",
  "Bombay",
  "American Shorthair",
].sort((a, b) => a.localeCompare(b));

function toTitleCase(s?: string) {
  if (!s) return "";
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function isAllCapsLabel(s: string) {
  const letters = s.replace(/[^A-Za-z]+/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

// For DOG labels coming from the list, this mainly fixes ALL CAPS if it ever appears.
function normalizeBreedLabel(input: string) {
  const raw = input.trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (lower === "mix-breed") return "Mix-breed";
  if (lower === "cross-breed") return "Cross-breed";
  if (lower === "indie (indian pariah)") return "Indie (Indian Pariah)";

  if (isAllCapsLabel(raw)) return toTitleCase(raw);
  return raw;
}

// For free-text (cats + custom dog breeds), Title Case but preserve common acronyms like (DSH)
function normalizeFreeTextBreed(input: string) {
  let s = input.trim();
  if (!s) return "";
  s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  // Preserve acronyms inside parentheses: (dsh) -> (DSH)
  s = s.replace(/\(([a-z0-9]{2,6})\)/g, (_, p1) => `(${String(p1).toUpperCase()})`);
  // Preserve a few known acronyms even if not in parentheses
  s = s.replace(/\b(dsh|dmh|dlh|akc|fci)\b/gi, (m) => m.toUpperCase());
  return s;
}

function getBreedTypeFromLabel(label: string): BreedType {
  const l = label.trim().toLowerCase();
  if (l === "mix-breed") return "Mix-breed";
  if (l === "cross-breed") return "Cross-breed";
  return "Purebred";
}

function formatFciText(fci?: { groupNo?: number; groupName?: string }) {
  const groupNo = fci?.groupNo;
  const groupName = fci?.groupName ? toTitleCase(fci.groupName) : undefined;

  if (groupNo && groupName) return `FCI: Group ${groupNo} — ${groupName}`;
  if (groupNo) return `FCI: Group ${groupNo}`;
  if (groupName) return `FCI: ${groupName}`;
  return null;
}

function formatAkcText(akc?: { groupName?: string }) {
  const name = akc?.groupName ? toTitleCase(akc.groupName) : undefined;
  return name ? `AKC: ${name}` : null;
}

const PetSchema = z.object({
  name: z.string().min(1),
  species: z.string().default("Dog"),
  breed: z.string().optional(),
  breedType: z.enum(["Purebred", "Mix-breed", "Cross-breed"]).optional(),
  breedComponents: z.array(z.string()).optional(),
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
    breedType: "Purebred" as BreedType,
    breedComponents: [] as string[],
    sex: "",
    dob: "",
    microchipNo: "",
    temperament: "",
    notes: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dogBreedOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts = BREEDS.map((b) => normalizeBreedLabel(b.label)).filter(Boolean);
    const unique: string[] = [];
    for (const o of opts) {
      const key = o.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(o);
    }
    return unique;
  }, []);

  const dogBreedSet = useMemo(() => {
    return new Set(dogBreedOptions.map((b) => b.toLowerCase()));
  }, [dogBreedOptions]);

  const catBreedSet = useMemo(() => {
    return new Set(CAT_BREEDS.map((b) => b.toLowerCase()));
  }, []);

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
      setPets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
  }, [clientId]);

  const header = useMemo(() => {
    if (!client) return "Client";
    return client.name ?? "Client";
  }, [client]);

  const selectedBreedRecord = useMemo(() => {
    if (!form.breed) return undefined;
    // Only meaningful for dogs
    if (form.species === "Cat") return undefined;
    return findBreedRecordByLabel(normalizeBreedLabel(form.breed));
  }, [form.breed, form.species]);

  const groupLine = useMemo(() => {
    const parts: string[] = [];
    const fci = formatFciText(selectedBreedRecord?.fci);
    const akc = formatAkcText(selectedBreedRecord?.akc);
    if (fci) parts.push(fci);
    if (akc) parts.push(akc);
    return parts.join(" • ");
  }, [selectedBreedRecord]);

  const breedNotFound = useMemo(() => {
    const b = form.breed.trim();
    if (!b) return false;

    if (form.species === "Cat") {
      return !catBreedSet.has(b.toLowerCase());
    }

    // Dog / Other: warn if not in dog list AND not special options
    const norm = normalizeBreedLabel(b).toLowerCase();
    return !dogBreedSet.has(norm);
  }, [form.breed, form.species, dogBreedSet, catBreedSet]);

  function onBreedChange(next: string) {
    // For cats we keep it readable but preserve acronyms
    const cleaned =
      form.species === "Cat" ? normalizeFreeTextBreed(next) : normalizeBreedLabel(next);

    const nextType = getBreedTypeFromLabel(cleaned);

    setForm((prev) => ({
      ...prev,
      breed: cleaned,
      breedType: nextType,
      breedComponents:
        nextType === "Purebred"
          ? []
          : prev.breedComponents.length
            ? prev.breedComponents
            : ["", ""],
    }));
  }

  function updateComponent(idx: number, value: string) {
    const cleaned = normalizeBreedLabel(value);
    setForm((prev) => {
      const next = [...prev.breedComponents];
      next[idx] = cleaned;
      return { ...prev, breedComponents: next };
    });
  }

  function addComponentRow() {
    setForm((prev) => ({ ...prev, breedComponents: [...prev.breedComponents, ""] }));
  }

  function removeComponentRow(idx: number) {
    setForm((prev) => {
      const next = prev.breedComponents.filter((_, i) => i !== idx);
      while (
        (prev.breedType === "Mix-breed" || prev.breedType === "Cross-breed") &&
        next.length < 2
      )
        next.push("");
      return { ...prev, breedComponents: next };
    });
  }

  async function createPet(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const breedType = form.breedType;
    const comps =
      breedType === "Mix-breed" || breedType === "Cross-breed"
        ? (form.breedComponents || []).map((x) => x.trim()).filter(Boolean)
        : [];

    if ((breedType === "Mix-breed" || breedType === "Cross-breed") && comps.length < 2) {
      setErr("Select at least 2 breeds for Mix-breed / Cross-breed.");
      return;
    }

    const finalBreed =
      form.species === "Cat"
        ? normalizeFreeTextBreed(form.breed)
        : normalizeBreedLabel(form.breed);

    const parsed = PetSchema.safeParse({
      name: form.name.trim(),
      species: form.species.trim() || "Dog",
      breed: finalBreed.trim() || undefined,
      breedType,
      breedComponents: comps.length ? comps.map(normalizeBreedLabel) : [],
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

      setForm({
        name: "",
        species: "Dog",
        breed: "",
        breedType: "Purebred",
        breedComponents: [],
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
              pets.map((p) => (
                <Link
                  key={p.id}
                  className="block border rounded-xl p-3 hover:bg-neutral-50"
                  href={`/pets/${p.id}`}
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    {p.species ?? "Dog"} • {p.breed ?? "—"} • Microchip{" "}
                    {p.microchipNo ?? "—"}
                  </p>
                </Link>
              ))
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
                <select
                  className="w-full border rounded-lg p-2"
                  value={form.species}
                  onChange={(e) => {
                    const next = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      species: next,
                      // clear breed if switching species to avoid mismatch confusion
                      breed: "",
                      breedType: "Purebred",
                      breedComponents: [],
                    }));
                  }}
                >
                  <option value="Dog">Dog</option>
                  <option value="Cat">Cat</option>
                  <option value="Other">Other</option>
                </select>
              </Field>

              <Field label="Breed">
                {form.species === "Cat" ? (
                  <>
  <select
    className="w-full border rounded-lg p-2"
    value={CAT_BREEDS.includes(form.breed) ? form.breed : ""}
    onChange={(e) => onBreedChange(e.target.value)}
  >
    <option value="">— Select cat breed —</option>
    {CAT_BREEDS.map((b) => (
      <option key={b} value={b}>
        {b}
      </option>
    ))}
  </select>

  <input
    className="w-full border rounded-lg p-2 mt-2"
    value={form.breed}
    onChange={(e) => onBreedChange(e.target.value)}
    placeholder="Or type a breed/type (e.g., Domestic Short Hair (DSH))"
  />
</>

                ) : (
                  <>
                    <input
                      className="w-full border rounded-lg p-2"
                      list="dog-breed-options"
                      value={form.breed}
                      onChange={(e) => onBreedChange(e.target.value)}
                      placeholder="Type to search…"
                    />
                    <datalist id="dog-breed-options">
                      {dogBreedOptions.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>

                    {groupLine ? (
                      <p className="text-xs text-neutral-600 mt-1">{groupLine}</p>
                    ) : null}
                  </>
                )}

                {breedNotFound ? (
                  <p className="text-xs text-amber-700 mt-1">
                    Breed not found in the list — it will be saved as custom text.
                  </p>
                ) : null}
              </Field>
            </div>

            {(form.breedType === "Mix-breed" || form.breedType === "Cross-breed") ? (
              <div className="border rounded-xl p-3">
                <p className="text-xs text-neutral-600">
                  {form.breedType} components (select at least 2)
                </p>

                <div className="mt-2 space-y-2">
                  {form.breedComponents.map((val, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select
                        className="flex-1 border rounded-lg p-2"
                        value={val}
                        onChange={(e) => updateComponent(idx, e.target.value)}
                      >
                        <option value="">— Select breed —</option>
                        {dogBreedOptions
                          .filter((b) => {
                            const l = b.toLowerCase();
                            return l !== "mix-breed" && l !== "cross-breed";
                          })
                          .map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                      </select>

                      <button
                        type="button"
                        className="border rounded-lg px-3 text-sm"
                        onClick={() => removeComponentRow(idx)}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-2 text-sm underline"
                  onClick={addComponentRow}
                >
                  + Add another breed
                </button>
              </div>
            ) : null}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
