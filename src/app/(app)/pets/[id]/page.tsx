"use client";

import { normalizeToE164, buildWhatsAppLink } from "@/lib/whatsapp";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

function normalizeFreeTextBreed(input: string) {
  let s = input.trim();
  if (!s) return "";
  s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  s = s.replace(/\(([a-z0-9]{2,6})\)/g, (_, p1) => `(${String(p1).toUpperCase()})`);
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

function tsToDateInput(v: any): string {
  if (!v) return "";
  try {
    const d =
      v instanceof Timestamp
        ? v.toDate()
        : typeof v?.toDate === "function"
          ? v.toDate()
          : v instanceof Date
            ? v
            : null;
    if (!d) return "";
    const yyyy = String(d.getFullYear()).padStart(4, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function calcAgeLabel(dobStr: string) {
  if (!dobStr) return "";
  const d = new Date(dobStr);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  let months =
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth());

  // If current day is before birth day, subtract one month
  if (now.getDate() < d.getDate()) months -= 1;

  if (months < 0) return "";

  const years = Math.floor(months / 12);
  const remMonths = months % 12;

  const y = years === 1 ? "1 year" : `${years} years`;
  const m = remMonths === 1 ? "1 month" : `${remMonths} months`;

  if (years === 0 && remMonths === 0) return "Age: < 1 month";
  if (years === 0) return `Age: ${m}`;
  if (remMonths === 0) return `Age: ${y}`;
  return `Age: ${y} ${m}`;
}

function comparableForm(form: {
  name: string;
  species: string;
  breed: string;
  breedType: BreedType;
  breedComponents: string[];
  sex: string;
  dob: string;
  microchipNo: string;
  temperament: string;
  notes: string;
}) {
  const species = form.species.trim() || "Dog";
  const breedType = form.breedType;

  const breed =
    species === "Cat"
      ? normalizeFreeTextBreed(form.breed)
      : normalizeBreedLabel(form.breed);

  const comps =
    breedType === "Mix-breed" || breedType === "Cross-breed"
      ? form.breedComponents
          .map((x) => (species === "Cat" ? normalizeFreeTextBreed(x) : normalizeBreedLabel(x)))
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

  return JSON.stringify({
    name: form.name.trim(),
    species,
    breed: breed.trim(),
    breedType,
    breedComponents: comps,
    sex: form.sex.trim(),
    dob: form.dob.trim(),
    microchipNo: form.microchipNo.trim(),
    temperament: form.temperament.trim(),
    notes: form.notes.trim(),
  });
}

export default function PetDetailPage() {
  const params = useParams<{ id: string }>();
  const petId = params.id;

  const [pet, setPet] = useState<any | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [baseline, setBaseline] = useState<string>("");

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

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return comparableForm(form) !== baseline;
  }, [baseline, form]);

  const dogBreedOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: string[] = [];
    for (const b of BREEDS) {
      const label = normalizeBreedLabel(b.label);
      const k = label.toLowerCase();
      if (!label || seen.has(k)) continue;
      seen.add(k);
      opts.push(label);
    }
    return opts;
  }, []);

  const dogComponentOptions = useMemo(() => {
    return dogBreedOptions.filter((b) => {
      const l = b.toLowerCase();
      return l !== "mix-breed" && l !== "cross-breed";
    });
  }, [dogBreedOptions]);

  const catComponentOptions = useMemo(() => CAT_BREEDS, []);

  useEffect(() => {
    async function load() {
      try {
        const ref = doc(db, "pets", petId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setPet(null);
          return;
        }

        const data = { id: snap.id, ...snap.data() } as any;
        setPet(data);

        const species = (data?.species ?? "Dog") as string;
        const breedLabel =
          species === "Cat"
            ? normalizeFreeTextBreed(data?.breed ?? "")
            : normalizeBreedLabel(data?.breed ?? "");

        const inferredType: BreedType =
          (data?.breedType as BreedType) ??
          (breedLabel ? getBreedTypeFromLabel(breedLabel) : "Purebred");

        const compsRaw = Array.isArray(data?.breedComponents) ? data.breedComponents : [];
        const compsNorm =
          species === "Cat"
            ? compsRaw.map((x: any) => normalizeFreeTextBreed(String(x ?? ""))).filter(Boolean)
            : compsRaw.map((x: any) => normalizeBreedLabel(String(x ?? ""))).filter(Boolean);

        const nextForm = {
          name: data?.name ?? "",
          species,
          breed: breedLabel,
          breedType: inferredType,
          breedComponents: inferredType === "Purebred" ? ["", ""] : (compsNorm.length ? compsNorm : ["", ""]),
          sex: data?.sex ?? "",
          dob: tsToDateInput(data?.dob),
          microchipNo: data?.microchipNo ?? "",
          temperament: data?.temperament ?? "",
          notes: data?.notes ?? "",
        };

        setForm(nextForm);
        setBaseline(comparableForm(nextForm));
        setMsg(null);
        setErr(null);
      } catch {
        setPet(null);
      }
    }

    load();
  }, [petId]);

  const selectedBreedRecord = useMemo(() => {
    if (!form.breed) return undefined;
    if (form.species !== "Dog") return undefined;
    return findBreedRecordByLabel(normalizeBreedLabel(form.breed));
  }, [form.breed, form.species]);

  const groupLine = useMemo(() => {
    if (form.species !== "Dog") return "";
    const parts: string[] = [];
    const fci = formatFciText(selectedBreedRecord?.fci);
    const akc = formatAkcText(selectedBreedRecord?.akc);
    if (fci) parts.push(fci);
    if (akc) parts.push(akc);
    return parts.join(" • ");
  }, [selectedBreedRecord, form.species]);

  const catSelectValue = useMemo(() => {
    return CAT_BREEDS.includes(form.breed) ? form.breed : "";
  }, [form.breed]);

  const showCustomCatBreedInput = useMemo(() => {
    // Show the custom input only if dropdown is blank/custom
    return form.species === "Cat" && catSelectValue === "";
  }, [form.species, catSelectValue]);

  function onBreedChange(next: string) {
    const cleaned =
      form.species === "Cat" ? normalizeFreeTextBreed(next) : normalizeBreedLabel(next);

    const nextType = getBreedTypeFromLabel(cleaned);

    setForm((prev) => ({
      ...prev,
      breed: cleaned,
      // For cats, we still let you choose breedType manually; don't auto-force here.
      breedType: prev.breedType || nextType,
    }));
  }

  function updateComponent(idx: number, value: string) {
    const cleaned =
      form.species === "Cat" ? normalizeFreeTextBreed(value) : normalizeBreedLabel(value);

    setForm((prev) => {
      const next = [...prev.breedComponents];
      next[idx] = cleaned;
      return { ...prev, breedComponents: next };
    });
  }

  function addComponentRow() {
    setForm((prev) => {
      if (prev.breedComponents.length >= 4) return prev;
      return { ...prev, breedComponents: [...prev.breedComponents, ""] };
    });
  }

  function removeComponentRow(idx: number) {
    setForm((prev) => {
      const next = prev.breedComponents.filter((_, i) => i !== idx);
      while ((prev.breedType === "Mix-breed" || prev.breedType === "Cross-breed") && next.length < 2) next.push("");
      return { ...prev, breedComponents: next };
    });
  }

  async function save() {
    setErr(null);
    setMsg(null);

    const name = form.name.trim();
    if (!name) {
      setErr("Pet name is required.");
      return;
    }

    const species = (form.species.trim() || "Dog") as string;

    const normalizedBreed =
      species === "Cat"
        ? normalizeFreeTextBreed(form.breed)
        : normalizeBreedLabel(form.breed);

    const breedType = form.breedType;

    const comps =
      breedType === "Mix-breed" || breedType === "Cross-breed"
        ? form.breedComponents
            .map((x) => (species === "Cat" ? normalizeFreeTextBreed(x) : normalizeBreedLabel(x)))
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

    if ((breedType === "Mix-breed" || breedType === "Cross-breed") && comps.length < 2) {
      setErr("Select at least 2 component breeds for Mix-breed / Cross-breed.");
      return;
    }

    const payload: any = {
      name,
      species,
      sex: form.sex.trim() || "",
      microchipNo: form.microchipNo.trim() || "",
      temperament: form.temperament.trim() || "",
      notes: form.notes.trim() || "",
      updatedAt: Timestamp.now(),
      breedType,
      breed: normalizedBreed.trim() || "",
      breedComponents: comps,
    };

    if (form.dob?.trim()) {
      const d = new Date(form.dob.trim());
      payload.dob = isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
    } else {
      payload.dob = null;
    }

    setSaving(true);
    try {
      const ref = doc(db, "pets", petId);
      await updateDoc(ref, payload);

      const postSaveForm = {
        ...form,
        name,
        species,
        breedType,
        breed: normalizedBreed,
        breedComponents: breedType === "Purebred" ? ["", ""] : (comps.length ? comps : ["", ""]),
      };

      setForm(postSaveForm);
      setBaseline(comparableForm(postSaveForm));
      setMsg("Saved.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (pet === undefined) {
    return (
      <main className="p-6">
        <p className="text-sm text-neutral-600">Loading…</p>
      </main>
    );
  }

  if (pet === null) {
    return (
      <main className="p-6">
        <Link className="text-sm underline" href="/pets">
          ← Back
        </Link>
        <p className="mt-4">Pet not found.</p>
      </main>
    );
  }

  const buttonText = saving ? "Saving..." : (!isDirty && baseline ? "Saved" : "Save changes");
  const ageLabel = calcAgeLabel(form.dob);

  const componentOptions = form.species === "Cat" ? catComponentOptions : dogComponentOptions;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="text-sm underline" href="/pets">
            ← Back
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Pet profile</h1>
          <p className="text-sm text-neutral-600 mt-1">
            ID: <span className="font-mono text-xs">{petId}</span>
            {pet?.clientId ? (
              <>
                {" "}•{" "}
                <Link className="underline" href={`/clients/${pet.clientId}`}>
                  Client
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <button
          onClick={save}
          className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60"
          disabled={saving || (!!baseline && !isDirty)}
        >
          {buttonText}
        </button>
      </div>

      <div className="border rounded-2xl p-4 max-w-3xl">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Pet name *">
            <input
              className="w-full border rounded-lg p-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field label="Species">
            <select
              className="w-full border rounded-lg p-2"
              value={form.species}
              onChange={(e) => {
                const next = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  species: next,
                  breed: "",
                  breedComponents: ["", ""],
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
                  value={catSelectValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      // user picked custom/blank; keep breed as-is (or empty)
                      setForm((prev) => ({ ...prev, breed: prev.breed && !CAT_BREEDS.includes(prev.breed) ? prev.breed : "" }));
                      return;
                    }
                    setForm((prev) => ({ ...prev, breed: v }));
                  }}
                >
                  <option value="">— Custom / not in list —</option>
                  {CAT_BREEDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                {showCustomCatBreedInput ? (
                  <input
                    className="w-full border rounded-lg p-2 mt-2"
                    value={form.breed}
                    onChange={(e) => setForm((prev) => ({ ...prev, breed: normalizeFreeTextBreed(e.target.value) }))}
                    placeholder="Type cat breed/type (e.g., Domestic Short Hair (DSH))"
                  />
                ) : null}
              </>
            ) : (
              <>
                <input
                  className="w-full border rounded-lg p-2"
                  list="breed-options"
                  value={form.breed}
                  onChange={(e) => onBreedChange(e.target.value)}
                  placeholder="Type to search…"
                />
                <datalist id="breed-options">
                  {dogBreedOptions.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>

                {groupLine ? <p className="text-xs text-neutral-600 mt-1">{groupLine}</p> : null}
              </>
            )}
          </Field>

          <Field label="Breed type">
            <select
              className="w-full border rounded-lg p-2"
              value={form.breedType}
              onChange={(e) => {
                const nextType = e.target.value as BreedType;
                setForm((prev) => ({
                  ...prev,
                  breedType: nextType,
                  breedComponents: nextType === "Purebred" ? ["", ""] : (prev.breedComponents.length ? prev.breedComponents : ["", ""]),
                }));
              }}
            >
              <option value="Purebred">Purebred</option>
              <option value="Mix-breed">Mix-breed</option>
              <option value="Cross-breed">Cross-breed</option>
            </select>
          </Field>
        </div>

        {(form.breedType === "Mix-breed" || form.breedType === "Cross-breed") ? (
          <div className="mt-4 border rounded-xl p-3 bg-neutral-50 space-y-2">
            <p className="text-xs text-neutral-600">
              {form.breedType} components (select at least 2)
            </p>

            {form.breedComponents.map((val, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  className="flex-1 border rounded-lg p-2"
                  value={val}
                  onChange={(e) => updateComponent(idx, e.target.value)}
                >
                  <option value="">— Select breed/type —</option>
                  {componentOptions.map((b) => (
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

            {form.breedComponents.length < 4 ? (
              <button type="button" className="text-sm underline" onClick={addComponentRow}>
                + Add another component
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid md:grid-cols-2 gap-3 mt-4">
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
            <>
              <input
                type="date"
                className="w-full border rounded-lg p-2"
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
              />
              {ageLabel ? (
                <p className="text-xs text-neutral-600 mt-1">{ageLabel}</p>
              ) : null}
            </>
          </Field>

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
        </div>

        <Field label="Notes">
          <textarea
            className="w-full border rounded-lg p-2 mt-1"
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        {err ? <p className="text-sm text-red-600 mt-3">{err}</p> : null}
        {msg ? <p className="text-sm text-green-700 mt-3">{msg}</p> : null}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mt-3">
      <span className="text-xs text-neutral-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
