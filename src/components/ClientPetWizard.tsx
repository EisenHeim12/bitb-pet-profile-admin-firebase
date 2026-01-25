"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Modal from "@/components/Modal";

type Client = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  clients: Client[];
};

function normalizePhone(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return digits ? `+${digits}` : "";
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

  const existingClientMatch = useMemo(() => {
    const n = normalizePhone(clientForm.phone);
    if (!n) return null;
    return clients.find((c) => normalizePhone(c.phone ?? "") === n) ?? null;
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

    setBusy(true);
    try {
      let clientId = selectedClientId;

      if (mode === "new") {
        const phoneNorm = normalizePhone(clientForm.phone);

        if (phoneNorm) {
          const dupSnap = await getDocs(
            query(collection(db, "clients"), where("phone", "==", phoneNorm))
          );
          if (!dupSnap.empty) clientId = dupSnap.docs[0].id;
        }

        if (!clientId) {
          const clientRef = await addDoc(collection(db, "clients"), {
            name: clientForm.name.trim(),
            phone: phoneNorm || null,
            email: clientForm.email.trim() || null,
            address: clientForm.address.trim() || null,
            notes: clientForm.notes.trim() || null,
            createdAt: Timestamp.now(),
          });
          clientId = clientRef.id;
        }
      }

      if (!clientId) throw new Error("Missing clientId (step 1 not completed).");

      const dob = petForm.dob ? Timestamp.fromDate(new Date(petForm.dob)) : null;

      const petRef = await addDoc(collection(db, "pets"), {
        clientId,
        name: petForm.name.trim(),
        species: petForm.species.trim() || "Dog",
        breed: petForm.breed.trim() || null,
        sex: petForm.sex.trim() || null,
        dob,
        microchipNo: petForm.microchipNo.trim() || null,
        temperament: petForm.temperament.trim() || null,
        notes: petForm.notes.trim() || null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      close();
      router.push(`/pets/${petRef.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create client/pet");
      setBusy(false);
    }
  }

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
                      {c.name}{c.phone ? ` (${c.phone})` : ""}
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
                {mode === "existing"
                  ? (clientById.get(selectedClientId)?.name ?? "—")
                  : clientForm.name.trim() || "—"}
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
                <input
                  className="w-full border rounded-lg p-2"
                  value={petForm.species}
                  onChange={(e) => setPetForm({ ...petForm, species: e.target.value })}
                />
              </Field>
              <Field label="Breed">
                <input
                  className="w-full border rounded-lg p-2"
                  value={petForm.breed}
                  onChange={(e) => setPetForm({ ...petForm, breed: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Sex">
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
                onClick={() => { setErr(null); setStep(1); }}
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
  {busy ? "Saving..." : (mode === "existing" ? "Create pet" : "Create client + pet")}
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
