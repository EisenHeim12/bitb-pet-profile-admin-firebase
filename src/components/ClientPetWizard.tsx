"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Modal from "@/components/Modal";
import { normalizeToE164 } from "@/lib/whatsapp";
import { BREEDS } from "@/lib/breeds";

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

type Client = {
  id: string;
  name: string;
  phone?: string; // raw user input
  phoneE164?: string; // derived
  email?: string;
  address?: string;
  notes?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  clients: Client[];
};

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

function derivePhoneE164(raw: string, defaultCountryCode = "91") {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return normalizeToE164(s, defaultCountryCode);
}

export default function ClientPetWizard({ open, onClose, clients }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const [clientForm, setClientForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const [petForm, setPetForm] = useState({
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
  const [busy, setBusy] = useState(false);

  const clientById = useMemo(() => {
    const m = new Map<string, Client>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);

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

  const catSelectValue = useMemo(() => {
    return CAT_BREEDS.includes(petForm.breed) ? petForm.breed : "";
  }, [petForm.breed]);

  const showCustomCatBreedInput = useMemo(() => {
    return petForm.species === "Cat" && catSelectValue === "";
  }, [petForm.species, catSelectValue]);

  function updateComponent(idx: number, value: string) {
    const cleaned = petForm.species === "Cat" ? normalizeFreeTextBreed(value) : normalizeBreedLabel(value);

    setPetForm((prev) => {
      const next = [...prev.breedComponents];
      next[idx] = cleaned;
      return { ...prev, breedComponents: next };
    });
  }

  function addComponentRow() {
    setPetForm((prev) => {
      if (prev.breedComponents.length >= 4) return prev;
      return { ...prev, breedComponents: [...prev.breedComponents, ""] };
    });
  }

  function removeComponentRow(idx: number) {
    setPetForm((prev) => {
      const next = prev.breedComponents.filter((_, i) => i !== idx);
      while ((prev.breedType === "Mix-breed" || prev.breedType === "Cross-breed") && next.length < 2) next.push("");
      return { ...prev, breedComponents: next };
    });
  }

  // Detect duplicates using derived E164 (prefer stored phoneE164, fallback to runtime-derive from phone)
  const existingClientMatch = useMemo(() => {
    const target = derivePhoneE164(clientForm.phone);
    if (!target) return null;

    return (
      clients.find((c) => {
        if (c.phoneE164 && c.phoneE164 === target) return true;
        const fallback = c.phone ? derivePhoneE164(c.phone) : null;
        return !!fallback && fallback === target;
      }) ?? null
    );
  }, [clientForm.phone, clients]);

  function resetAll() {
    setStep(1);
    setMode("existing");
    setSelectedClientId("");
    setClientForm({ name: "", phone: "", email: "", address: "", notes: "" });
    setPetForm({
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
    setErr(null);
    setBusy(false);
  }

  function close() {
    resetAll();
    onClose();
  }

  async function nextFromStep1() {
    setErr(null);

    if (mode === "existing") {
      if (!selectedClientId) return setErr("Select a client.");
      setStep(2);
      return;
    }

    if (!clientForm.name.trim()) return setErr("Client name is required.");

    if (existingClientMatch) {
      setErr(`Client already exists for this phone: ${existingClientMatch.name}. Select them instead.`);
      setMode("existing");
      setSelectedClientId(existingClientMatch.id);
      return;
    }

    setStep(2);
  }

  async function createAll() {
    setErr(null);
    if (!petForm.name.trim()) return setErr("Pet name is required.");

    // Validate mix/cross components
    if ((petForm.breedType === "Mix-breed" || petForm.breedType === "Cross-breed") && petForm.breedComponents.filter((x) => x.trim()).length < 2) {
      return setErr("Select at least 2 component breeds for Mix-breed / Cross-breed.");
    }

    setBusy(true);
    try {
      let clientId = selectedClientId;

      if (mode === "new") {
        const phoneRaw = clientForm.phone.trim();
        const phoneE164 = derivePhoneE164(phoneRaw);

        // Extra safety: check Firestore for duplicates (covers stale client list + legacy data)
        if (phoneE164) {
          const dupByE164 = await getDocs(query(collection(db, "clients"), where("phoneE164", "==", phoneE164)));
          if (!dupByE164.empty) clientId = dupByE164.docs[0].id;

          if (!clientId) {
            const dupLegacyPhone = await getDocs(query(collection(db, "clients"), where("phone", "==", phoneE164)));
            if (!dupLegacyPhone.empty) clientId = dupLegacyPhone.docs[0].id;
          }
        }

        if (!clientId && phoneRaw) {
          const dupByRaw = await getDocs(query(collection(db, "clients"), where("phone", "==", phoneRaw)));
          if (!dupByRaw.empty) clientId = dupByRaw.docs[0].id;
        }

        if (!clientId) {
          const clientPayload: any = {
            name: clientForm.name.trim(),
            phone: phoneRaw || null, // RAW
            ...(phoneE164 ? { phoneE164 } : {}),
            email: clientForm.email.trim() || null,
            address: clientForm.address.trim() || null,
            notes: clientForm.notes.trim() || null,
            createdAt: Timestamp.now(),
          };

          const clientRef = await addDoc(collection(db, "clients"), clientPayload);
          clientId = clientRef.id;
        }
      }

      if (!clientId) throw new Error("Missing clientId (step 1 not completed).");

      const dob = petForm.dob ? Timestamp.fromDate(new Date(petForm.dob)) : null;
      const species = (petForm.species.trim() || "Dog") as string;

      const normalizedBreed =
        species === "Cat"
          ? normalizeFreeTextBreed(petForm.breed)
          : normalizeBreedLabel(petForm.breed);

      const comps =
        petForm.breedType === "Mix-breed" || petForm.breedType === "Cross-breed"
          ? petForm.breedComponents
              .map((x) => (species === "Cat" ? normalizeFreeTextBreed(x) : normalizeBreedLabel(x)))
              .map((x) => x.trim())
              .filter(Boolean)
          : [];

      const petRef = await addDoc(collection(db, "pets"), {
        clientId,
        name: petForm.name.trim(),
        species,
        breedType: petForm.breedType,
        breed: (normalizedBreed ?? "").trim(),
        breedComponents: comps,
        sex: petForm.sex.trim() || null,
        dob,
        microchipNo: petForm.microchipNo.trim() || null,
        temperament: petForm.temperament.trim() || null,
        notes: petForm.notes.trim() || null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // ✅ No stupid redirect. Just close + refresh so lists update.
      close();
      router.refresh();
      void petRef; // keep TS happy if unused by tooling
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create client/pet");
      setBusy(false);
    }
  }

  const componentOptions = petForm.species === "Cat" ? catComponentOptions : dogComponentOptions;

  return (
    <Modal open={open} onClose={close} title={step === 1 ? "Add client + pet" : "Pet details"}>
      <div className="space-y-3">
        {step === 1 ? (
          <>
            <div className="flex gap-2">
              <button
                className={`rounded-lg border px-3 py-2 text-sm ${mode === "existing" ? "bg-neutral-100" : ""}`}
                onClick={() => setMode("existing")}
                type="button"
              >
                Use existing client
              </button>
              <button
                className={`rounded-lg border px-3 py-2 text-sm ${mode === "new" ? "bg-neutral-100" : ""}`}
                onClick={() => setMode("new")}
                type="button"
              >
                Create new client
              </button>
            </div>

            {mode === "existing" ? (
              <label className="block">
                <span className="text-xs text-neutral-600">Client *</span>
                <select
                  className="mt-1 w-full border rounded-lg p-2"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` (${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="space-y-2">
                <Field label="Client name *">
                  <input
                    className="w-full border rounded-lg p-2"
                    value={clientForm.name}
                    onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  />
                </Field>

                <Field label="Phone (recommended)">
                  <input
                    className="w-full border rounded-lg p-2"
                    placeholder="+91xxxxxxxxxx"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Email">
                    <input
                      className="w-full border rounded-lg p-2"
                      value={clientForm.email}
                      onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                    />
                  </Field>
                  <Field label="Address">
                    <input
                      className="w-full border rounded-lg p-2"
                      value={clientForm.address}
                      onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                    />
                  </Field>
                </div>

                <Field label="Notes">
                  <textarea
                    className="w-full border rounded-lg p-2"
                    rows={3}
                    value={clientForm.notes}
                    onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                  />
                </Field>

                {existingClientMatch ? (
                  <p className="text-xs text-amber-700">
                    Heads-up: a client already exists with this phone: <b>{existingClientMatch.name}</b>. Use existing to avoid duplicates.
                  </p>
                ) : null}
              </div>
            )}

            {err ? <p className="text-sm text-red-600">{err}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={close} type="button">
                Cancel
              </button>
              <button className="rounded-lg bg-black text-white px-3 py-2 text-sm" onClick={nextFromStep1} type="button">
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-neutral-600">
              Client:{" "}
              <b>
                {mode === "existing" ? (clientById.get(selectedClientId)?.name ?? "—") : clientForm.name.trim() || "—"}
              </b>
            </div>

            <Field label="Pet name *">
              <input
                className="w-full border rounded-lg p-2"
                value={petForm.name}
                onChange={(e) => setPetForm({ ...petForm, name: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Species">
                <select
                  className="w-full border rounded-lg p-2"
                  value={petForm.species}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPetForm((prev) => ({
                      ...prev,
                      species: next,
                      breed: "",
                      breedType: "Purebred",
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
                {petForm.species === "Cat" ? (
                  <>
                    <select
                      className="w-full border rounded-lg p-2"
                      value={catSelectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) {
                          setPetForm((prev) => ({
                            ...prev,
                            breed: prev.breed && !CAT_BREEDS.includes(prev.breed) ? prev.breed : "",
                          }));
                          return;
                        }
                        setPetForm((prev) => ({ ...prev, breed: v }));
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
                        value={petForm.breed}
                        onChange={(e) =>
                          setPetForm((prev) => ({ ...prev, breed: normalizeFreeTextBreed(e.target.value) }))
                        }
                        placeholder="Type cat breed/type (e.g., Domestic Short Hair (DSH))"
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    <input
                      className="w-full border rounded-lg p-2"
                      list="wizard-breed-options"
                      value={petForm.breed}
                      onChange={(e) => {
                        const cleaned = normalizeBreedLabel(e.target.value);
                        const inferred = getBreedTypeFromLabel(cleaned);

                        setPetForm((prev) => ({
                          ...prev,
                          breed: cleaned,
                          // If user typed Mix-breed/Cross-breed in breed field, auto-set breedType
                          breedType: inferred !== "Purebred" ? inferred : prev.breedType,
                          breedComponents:
                            inferred !== "Purebred"
                              ? prev.breedComponents.length ? prev.breedComponents : ["", ""]
                              : prev.breedComponents,
                        }));
                      }}
                      placeholder="Type to search…"
                    />
                    <datalist id="wizard-breed-options">
                      {dogBreedOptions.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
            </div>

            <Field label="Breed type">
              <select
                className="w-full border rounded-lg p-2"
                value={petForm.breedType}
                onChange={(e) => {
                  const nextType = e.target.value as BreedType;
                  setPetForm((prev) => ({
                    ...prev,
                    breedType: nextType,
                    breedComponents:
                      nextType === "Purebred"
                        ? ["", ""]
                        : prev.breedComponents.length
                          ? prev.breedComponents
                          : ["", ""],
                  }));
                }}
              >
                <option value="Purebred">Purebred</option>
                <option value="Mix-breed">Mix-breed</option>
                <option value="Cross-breed">Cross-breed</option>
              </select>
            </Field>

            {petForm.breedType === "Mix-breed" || petForm.breedType === "Cross-breed" ? (
              <div className="mt-2 border rounded-xl p-3 bg-neutral-50 space-y-2">
                <p className="text-xs text-neutral-600">{petForm.breedType} components (select at least 2)</p>

                {petForm.breedComponents.map((val, idx) => (
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

                {petForm.breedComponents.length < 4 ? (
                  <button type="button" className="text-sm underline" onClick={addComponentRow}>
                    + Add another component
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Field label="Gender">
                <select
                  className="w-full border rounded-lg p-2"
                  value={petForm.sex}
                  onChange={(e) => setPetForm({ ...petForm, sex: e.target.value })}
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
                  value={petForm.dob}
                  onChange={(e) => setPetForm({ ...petForm, dob: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Microchip #">
              <input
                className="w-full border rounded-lg p-2"
                value={petForm.microchipNo}
                onChange={(e) => setPetForm({ ...petForm, microchipNo: e.target.value })}
              />
            </Field>

            <Field label="Temperament">
              <input
                className="w-full border rounded-lg p-2"
                value={petForm.temperament}
                onChange={(e) => setPetForm({ ...petForm, temperament: e.target.value })}
              />
            </Field>

            <Field label="Notes">
              <textarea
                className="w-full border rounded-lg p-2"
                rows={3}
                value={petForm.notes}
                onChange={(e) => setPetForm({ ...petForm, notes: e.target.value })}
              />
            </Field>

            {err ? <p className="text-sm text-red-600">{err}</p> : null}

            <div className="flex justify-between gap-2 pt-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm"
                onClick={() => {
                  setErr(null);
                  setStep(1);
                }}
                type="button"
                disabled={busy}
              >
                Back
              </button>

              <button
                className="rounded-lg bg-black text-white px-3 py-2 text-sm disabled:opacity-60"
                onClick={createAll}
                type="button"
                disabled={busy}
              >
                {busy ? "Saving..." : mode === "existing" ? "Create pet" : "Create client + pet"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
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
