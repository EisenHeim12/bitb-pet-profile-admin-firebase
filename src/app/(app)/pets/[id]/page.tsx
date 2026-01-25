"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  getDocs,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { format, differenceInYears, differenceInMonths } from "date-fns";
import WeightChart from "@/components/WeightChart";
import Tabs from "@/components/Tabs";
import Modal from "@/components/Modal";
import { createReminderForDueDate, createMedicationReminders } from "@/lib/reminders";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

type Pet = any;

const TAB_KEYS = [
  "Overview",
  "Medical",
  "Vaccines & Parasites",
  "Grooming",
  "Training",
  "Meals",
  "Activity",
  "Transport",
  "Documents",
] as const;

// --- WhatsApp helpers (does NOT modify saved data) ---
function normalizeToE164(raw: string, defaultCountryCode = "91"): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  // keep digits and leading + if present
  let s = input.replace(/[^\d+]/g, "");

  // +<country><number>
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  // 00<country><number>
  if (s.startsWith("00")) {
    const digits = s.slice(2).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = s.replace(/\D/g, "");

  // India local formats
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${defaultCountryCode}${digits.slice(1)}`;

  // already includes country code, just missing +
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;

  return null;
}

function buildWhatsAppLink(e164: string, text: string): string {
  const waNumber = e164.replace(/[^\d]/g, ""); // wa.me expects digits only
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
}

export default function PetDetailPage() {
  const params = useParams<{ id: string }>();
  const petId = params.id;

  const [pet, setPet] = useState<Pet | null>(null);
  const [client, setClient] = useState<any | null>(null);
  const [vets, setVets] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof TAB_KEYS)[number]>("Overview");

  // Overview
  const [weights, setWeights] = useState<any[]>([]);
  const [weightModal, setWeightModal] = useState(false);
  const [weightForm, setWeightForm] = useState({ date: "", weightKg: "", notes: "" });

  // Medical: vet visits + meds
  const [visits, setVisits] = useState<any[]>([]);
  const [visitModal, setVisitModal] = useState(false);
  const [visitForm, setVisitForm] = useState({
    visitOn: "",
    vetId: "",
    reason: "",
    diagnosis: "",
    prognosis: "",
    followUpOn: "",
    notes: "",
  });

  const [meds, setMeds] = useState<any[]>([]);
  const [medModal, setMedModal] = useState(false);
  const [medForm, setMedForm] = useState({
    name: "",
    dosage: "",
    frequencyPerDay: "2",
    timesCsv: "09:00,21:00",
    startOn: "",
    endOn: "",
    notes: "",
  });

  // Vaccines + parasite
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [vacModal, setVacModal] = useState(false);
  const [vacForm, setVacForm] = useState({ name: "", administeredOn: "", dueOn: "", brand: "", batchNo: "", notes: "" });

  const [parasites, setParasites] = useState<any[]>([]);
  const [parModal, setParModal] = useState(false);
  const [parForm, setParForm] = useState({ type: "DEWORMING", product: "", administeredOn: "", dueOn: "", dose: "", notes: "" });

  // Grooming
  const [grooming, setGrooming] = useState<any[]>([]);
  const [groomModal, setGroomModal] = useState(false);
  const [groomForm, setGroomForm] = useState({ date: "", service: "", groomer: "", coatCondition: "", skinCondition: "", nextDueOn: "", notes: "" });

  // Training
  const [training, setTraining] = useState<any[]>([]);
  const [trainModal, setTrainModal] = useState(false);
  const [trainForm, setTrainForm] = useState({ date: "", sessionType: "", trainer: "", focus: "", progress: "", homework: "", nextSessionOn: "" });

  // Meals (single doc)
  const [mealPlan, setMealPlan] = useState<any | null>(null);
  const [mealSaving, setMealSaving] = useState(false);

  // Activity
  const [activities, setActivities] = useState<any[]>([]);
  const [actModal, setActModal] = useState(false);
  const [actForm, setActForm] = useState({ date: "", type: "Walk", durationMin: "30", intensity: "Moderate", notes: "" });

  // Transport
  const [transport, setTransport] = useState<any[]>([]);
  const [transModal, setTransModal] = useState(false);
  const [transForm, setTransForm] = useState({
    date: "",
    purpose: "Vet visit",
    from: "",
    to: "",
    pickupTime: "",
    dropTime: "",
    driver: "",
    status: "Scheduled",
    notes: "",
  });

  // Docs
  const [docs, setDocs] = useState<any[]>([]);
  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ kind: "Vaccination Card", notes: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);

  useEffect(() => {
    async function load() {
      const petRef = doc(db, "pets", petId);
      const petSnap = await getDoc(petRef);
      if (!petSnap.exists()) { setPet(null); return; }

      const petData = { id: petSnap.id, ...(petSnap.data() as any) } as any;
      setPet(petData);

      // client
      const clientRef = doc(db, "clients", petData.clientId);
      const clientSnap = await getDoc(clientRef);
      setClient(clientSnap.exists() ? { id: clientSnap.id, ...clientSnap.data() } : null);

      // vets list
      const vSnap = await getDocs(query(collection(db, "vets"), orderBy("createdAt", "desc")));
      setVets(vSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }
    load();
  }, [petId]);

  // Subscribe only what we need (lazy by tab)
  useEffect(() => {
    if (!pet) return;

    const unsubs: Array<() => void> = [];

    // Always subscribe to weights for overview chart (lightweight)
    unsubs.push(onSnapshot(query(collection(db, "pets", petId, "weights"), orderBy("weighedOn", "asc")), (snap) => {
      setWeights(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }));

    if (activeTab === "Medical") {
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "vetVisits"), orderBy("visitOn", "desc")), (snap) => {
        setVisits(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "medications"), orderBy("createdAt", "desc")), (snap) => {
        setMeds(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
    }

    if (activeTab === "Vaccines & Parasites") {
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "vaccinations"), orderBy("administeredOn", "desc")), (snap) => {
        setVaccines(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "parasiteTreatments"), orderBy("administeredOn", "desc")), (snap) => {
        setParasites(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
    }

    if (activeTab === "Grooming") {
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "grooming"), orderBy("date", "desc")), (snap) => {
        setGrooming(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
    }

    if (activeTab === "Training") {
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "training"), orderBy("date", "desc")), (snap) => {
        setTraining(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
    }

    if (activeTab === "Meals") {
      const mealRef = doc(db, "pets", petId, "profile", "mealPlan");
      getDoc(mealRef).then(s => setMealPlan(s.exists() ? s.data() : null));
    }

    if (activeTab === "Activity") {
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "activities"), orderBy("date", "desc")), (snap) => {
        setActivities(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
    }

    if (activeTab === "Transport") {
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "transport"), orderBy("date", "desc")), (snap) => {
        setTransport(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
    }

    if (activeTab === "Documents") {
      unsubs.push(onSnapshot(query(collection(db, "pets", petId, "documents"), orderBy("uploadedAt", "desc")), (snap) => {
        setDocs(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }));
    }

    return () => { unsubs.forEach(u => u()); };
  }, [activeTab, pet, petId]);

  const ageText = useMemo(() => {
    if (!pet?.dob) return "—";
    const dob = pet.dob.toDate ? pet.dob.toDate() : new Date(pet.dob);
    const y = differenceInYears(new Date(), dob);
    const m = differenceInMonths(new Date(), dob) % 12;
    if (y <= 0) return `${m} months`;
    return `${y}y ${m}m`;
  }, [pet?.dob]);

  const latestWeight = useMemo(() => {
    if (!weights.length) return null;
    const last = weights[weights.length - 1];
    return last?.weightKg ?? null;
  }, [weights]);

  const whatsappHref = useMemo(() => {
    // Your client field is "Phone" (capital P). Also accept "phone" just in case.
    const raw = String(client?.Phone ?? client?.phone ?? "").trim();
    const e164 = normalizeToE164(raw, "91");
    if (!e164) return null;

    const msg = `Hi ${client?.name ?? ""}. This is Beauty in the Beast. Update about ${pet?.name ?? "your pet"}: `;
    return buildWhatsAppLink(e164, msg);
  }, [client?.Phone, client?.phone, client?.name, pet?.name]);

  async function setPrimaryVet(vetId: string) {
    if (!pet) return;
    await updateDoc(doc(db, "pets", petId), { vetId: vetId || null, updatedAt: Timestamp.now() });
    setPet({ ...pet, vetId: vetId || null });
  }

  async function addWeight() {
    if (!weightForm.weightKg) return;
    const dt = weightForm.date ? new Date(weightForm.date) : new Date();
    await addDoc(collection(db, "pets", petId, "weights"), {
      weighedOn: Timestamp.fromDate(dt),
      weightKg: Number(weightForm.weightKg),
      notes: weightForm.notes.trim() || null,
      createdAt: Timestamp.now(),
    });
    setWeightForm({ date: "", weightKg: "", notes: "" });
    setWeightModal(false);
  }

  async function addVisit() {
    if (!visitForm.visitOn) return;
    const visitOn = Timestamp.fromDate(new Date(visitForm.visitOn));
    const followUpOn = visitForm.followUpOn ? Timestamp.fromDate(new Date(visitForm.followUpOn)) : null;

    await addDoc(collection(db, "pets", petId, "vetVisits"), {
      visitOn,
      vetId: visitForm.vetId || null,
      reason: visitForm.reason.trim() || null,
      diagnosis: visitForm.diagnosis.trim() || null,
      prognosis: visitForm.prognosis.trim() || null,
      followUpOn,
      notes: visitForm.notes.trim() || null,
      createdAt: Timestamp.now(),
    });

    if (followUpOn) {
      await createReminderForDueDate({
        petId,
        type: "FOLLOW_UP",
        title: `${pet?.name ?? "Pet"}: Follow-up vet visit`,
        dueAt: followUpOn.toDate(),
      });
    }

    setVisitForm({ visitOn: "", vetId: "", reason: "", diagnosis: "", prognosis: "", followUpOn: "", notes: "" });
    setVisitModal(false);
  }

  async function addMedication() {
    if (!medForm.name.trim() || !medForm.startOn) return;
    const startOn = Timestamp.fromDate(new Date(medForm.startOn));
    const endOn = medForm.endOn ? Timestamp.fromDate(new Date(medForm.endOn)) : null;

    const times = medForm.timesCsv.split(",").map(s => s.trim()).filter(Boolean);
    const frequencyPerDay = Number(medForm.frequencyPerDay);

    const medRef = await addDoc(collection(db, "pets", petId, "medications"), {
      name: medForm.name.trim(),
      dosage: medForm.dosage.trim() || null,
      frequencyPerDay: Number.isFinite(frequencyPerDay) ? frequencyPerDay : times.length || 1,
      times,
      startOn,
      endOn,
      notes: medForm.notes.trim() || null,
      active: true,
      createdAt: Timestamp.now(),
    });

    await createMedicationReminders({
      petId,
      petName: pet?.name ?? "Pet",
      medicationId: medRef.id,
      name: medForm.name.trim(),
      startOn: startOn.toDate(),
      endOn: endOn?.toDate() ?? null,
      times,
      daysAhead: 14,
    });

    setMedForm({ name: "", dosage: "", frequencyPerDay: "2", timesCsv: "09:00,21:00", startOn: "", endOn: "", notes: "" });
    setMedModal(false);
  }

  async function addVaccination() {
    if (!vacForm.name.trim() || !vacForm.administeredOn) return;
    const administeredOn = Timestamp.fromDate(new Date(vacForm.administeredOn));
    const dueOn = vacForm.dueOn ? Timestamp.fromDate(new Date(vacForm.dueOn)) : null;

    await addDoc(collection(db, "pets", petId, "vaccinations"), {
      name: vacForm.name.trim(),
      administeredOn,
      dueOn,
      brand: vacForm.brand.trim() || null,
      batchNo: vacForm.batchNo.trim() || null,
      notes: vacForm.notes.trim() || null,
      createdAt: Timestamp.now(),
    });

    if (dueOn) {
      await createReminderForDueDate({
        petId,
        type: "VACCINATION_DUE",
        title: `${pet?.name ?? "Pet"}: ${vacForm.name.trim()} due`,
        dueAt: dueOn.toDate(),
      });
    }

    setVacForm({ name: "", administeredOn: "", dueOn: "", brand: "", batchNo: "", notes: "" });
    setVacModal(false);
  }

  async function addParasite() {
    if (!parForm.product.trim() || !parForm.administeredOn) return;
    const administeredOn = Timestamp.fromDate(new Date(parForm.administeredOn));
    const dueOn = parForm.dueOn ? Timestamp.fromDate(new Date(parForm.dueOn)) : null;

    await addDoc(collection(db, "pets", petId, "parasiteTreatments"), {
      type: parForm.type,
      product: parForm.product.trim(),
      administeredOn,
      dueOn,
      dose: parForm.dose.trim() || null,
      notes: parForm.notes.trim() || null,
      createdAt: Timestamp.now(),
    });

    if (dueOn) {
      await createReminderForDueDate({
        petId,
        type: parForm.type === "DEWORMING" ? "DEWORMING_DUE" : "SPOTON_DUE",
        title: `${pet?.name ?? "Pet"}: ${parForm.type === "DEWORMING" ? "Deworming" : "Spot-on"} due`,
        dueAt: dueOn.toDate(),
      });
    }

    setParForm({ type: "DEWORMING", product: "", administeredOn: "", dueOn: "", dose: "", notes: "" });
    setParModal(false);
  }

  async function addGrooming() {
    if (!groomForm.date) return;
    const date = Timestamp.fromDate(new Date(groomForm.date));
    const nextDueOn = groomForm.nextDueOn ? Timestamp.fromDate(new Date(groomForm.nextDueOn)) : null;

    await addDoc(collection(db, "pets", petId, "grooming"), {
      date,
      service: groomForm.service.trim() || null,
      groomer: groomForm.groomer.trim() || null,
      coatCondition: groomForm.coatCondition.trim() || null,
      skinCondition: groomForm.skinCondition.trim() || null,
      nextDueOn,
      notes: groomForm.notes.trim() || null,
      createdAt: Timestamp.now(),
    });

    if (nextDueOn) {
      await createReminderForDueDate({
        petId,
        type: "GROOMING_DUE",
        title: `${pet?.name ?? "Pet"}: Grooming follow-up`,
        dueAt: nextDueOn.toDate(),
      });
    }

    setGroomForm({ date: "", service: "", groomer: "", coatCondition: "", skinCondition: "", nextDueOn: "", notes: "" });
    setGroomModal(false);
  }

  async function addTraining() {
    if (!trainForm.date) return;
    const date = Timestamp.fromDate(new Date(trainForm.date));
    const nextSessionOn = trainForm.nextSessionOn ? Timestamp.fromDate(new Date(trainForm.nextSessionOn)) : null;

    await addDoc(collection(db, "pets", petId, "training"), {
      date,
      sessionType: trainForm.sessionType.trim() || null,
      trainer: trainForm.trainer.trim() || null,
      focus: trainForm.focus.trim() || null,
      progress: trainForm.progress.trim() || null,
      homework: trainForm.homework.trim() || null,
      nextSessionOn,
      createdAt: Timestamp.now(),
    });

    if (nextSessionOn) {
      await createReminderForDueDate({
        petId,
        type: "TRAINING_DUE",
        title: `${pet?.name ?? "Pet"}: Training session`,
        dueAt: nextSessionOn.toDate(),
      });
    }

    setTrainForm({ date: "", sessionType: "", trainer: "", focus: "", progress: "", homework: "", nextSessionOn: "" });
    setTrainModal(false);
  }

  async function addActivity() {
    if (!actForm.date) return;
    await addDoc(collection(db, "pets", petId, "activities"), {
      date: Timestamp.fromDate(new Date(actForm.date)),
      type: actForm.type,
      durationMin: Number(actForm.durationMin),
      intensity: actForm.intensity,
      notes: actForm.notes.trim() || null,
      createdAt: Timestamp.now(),
    });
    setActForm({ date: "", type: "Walk", durationMin: "30", intensity: "Moderate", notes: "" });
    setActModal(false);
  }

  async function addTransport() {
    if (!transForm.date) return;
    await addDoc(collection(db, "pets", petId, "transport"), {
      date: Timestamp.fromDate(new Date(transForm.date)),
      purpose: transForm.purpose.trim() || null,
      from: transForm.from.trim() || null,
      to: transForm.to.trim() || null,
      pickupTime: transForm.pickupTime || null,
      dropTime: transForm.dropTime || null,
      driver: transForm.driver.trim() || null,
      status: transForm.status,
      notes: transForm.notes.trim() || null,
      createdAt: Timestamp.now(),
    });
    setTransForm({ date: "", purpose: "Vet visit", from: "", to: "", pickupTime: "", dropTime: "", driver: "", status: "Scheduled", notes: "" });
    setTransModal(false);
  }

  async function uploadDocument() {
    if (!docFile) return;
    setDocUploading(true);
    try {
      const fileExt = docFile.name.split(".").pop() ?? "file";
      const storagePath = `pets/${petId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExt}`;
      const r = ref(storage, storagePath);
      await uploadBytes(r, docFile);
      const url = await getDownloadURL(r);

      await addDoc(collection(db, "pets", petId, "documents"), {
        kind: docForm.kind,
        filename: docFile.name,
        storagePath,
        url,
        notes: docForm.notes.trim() || null,
        uploadedAt: Timestamp.now(),
      });

      setDocFile(null);
      setDocForm({ kind: "Vaccination Card", notes: "" });
      setDocModal(false);
    } finally {
      setDocUploading(false);
    }
  }

  async function del(sub: string, id: string) {
    await deleteDoc(doc(db, "pets", petId, sub, id));
  }

  if (pet === null) {
    return (
      <main className="p-6">
        <Link className="text-sm underline" href="/pets">← Back</Link>
        <p className="mt-4">Pet not found.</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="text-sm underline" href={client ? `/clients/${client.id}` : "/pets"}>← Back</Link>
          <h1 className="text-2xl font-semibold mt-2">{pet?.name ?? "Pet"}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Owner: {client?.name ?? "—"} • Breed: {pet?.breed ?? "—"} • Age: {ageText} • Microchip: {pet?.microchipNo ?? "—"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm">
            <span className="text-neutral-600">Primary Vet:</span>{" "}
            <select
              className="border rounded-lg p-2 text-sm"
              value={pet?.vetId ?? ""}
              onChange={(e) => setPrimaryVet(e.target.value)}
            >
              <option value="">—</option>
              {vets.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {whatsappHref ? (
            <a
              className="rounded-lg bg-black text-white px-3 py-2 text-sm"
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp owner
            </a>
          ) : (
            <button
              className="rounded-lg border px-3 py-2 text-sm opacity-60 cursor-not-allowed"
              disabled
              title='Add client "Phone" to enable WhatsApp'
            >
              WhatsApp owner
            </button>
          )}
        </div>
      </div>

      <Tabs tabs={TAB_KEYS as any} active={activeTab} onChange={(t) => setActiveTab(t)} />

      {activeTab === "Overview" ? (
        <section className="grid lg:grid-cols-[1fr_420px] gap-4">
          <div className="border rounded-2xl p-4">
            <h2 className="font-semibold">Weight tracking</h2>
            <p className="text-sm text-neutral-600 mt-1">Latest: {latestWeight ? `${latestWeight} kg` : "—"}</p>
            <div className="mt-3">
              <WeightChart
                data={weights.map(w => ({
                  date: format(w.weighedOn?.toDate?.() ?? new Date(), "dd MMM"),
                  weightKg: w.weightKg,
                }))}
              />
            </div>
            <button className="mt-4 rounded-lg border px-3 py-2 text-sm" onClick={() => setWeightModal(true)}>Add weight</button>
          </div>

          <div className="border rounded-2xl p-4">
            <h2 className="font-semibold">Quick info</h2>
            <div className="mt-3 space-y-2 text-sm">
              <Row k="Sex" v={pet?.sex ?? "—"} />
              <Row k="Species" v={pet?.species ?? "Dog"} />
              <Row k="Temperament" v={pet?.temperament ?? "—"} />
              <Row k="Notes" v={pet?.notes ?? "—"} />
            </div>
          </div>
        </section>
      ) : null}

      {/* --- rest of your tabs and modals remain unchanged --- */}
      {/* (Keeping your original code from here onward to avoid breaking anything.) */}

      {/* Medical */}
      {activeTab === "Medical" ? (
        <section className="grid lg:grid-cols-2 gap-4">
          <div className="border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Vet visits</h2>
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setVisitModal(true)}>Add</button>
            </div>
            <div className="mt-3 space-y-2">
              {visits.length === 0 ? <p className="text-sm text-neutral-600">No visits yet.</p> : visits.map(v => (
                <div key={v.id} className="border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{v.reason ?? "Vet visit"}</p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        {format(v.visitOn.toDate(), "dd MMM yyyy")} • Vet: {vets.find(x => x.id === v.vetId)?.name ?? "—"}
                        {v.followUpOn ? ` • Follow-up ${format(v.followUpOn.toDate(), "dd MMM yyyy")}` : ""}
                      </p>
                      {v.diagnosis ? <p className="text-xs mt-2"><span className="text-neutral-600">Dx:</span> {v.diagnosis}</p> : null}
                      {v.prognosis ? <p className="text-xs mt-1"><span className="text-neutral-600">Prognosis:</span> {v.prognosis}</p> : null}
                      {v.notes ? <p className="text-xs mt-1 text-neutral-600">{v.notes}</p> : null}
                    </div>
                    <button className="text-xs underline text-red-600" onClick={() => del("vetVisits", v.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Medications</h2>
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setMedModal(true)}>Add</button>
            </div>
            <p className="text-sm text-neutral-600 mt-1">
              This generates in-app reminders for the next 14 days. WhatsApp/SMS later.
            </p>
            <div className="mt-3 space-y-2">
              {meds.length === 0 ? <p className="text-sm text-neutral-600">No medications.</p> : meds.map(m => (
                <div key={m.id} className="border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        {m.dosage ? `${m.dosage} • ` : ""}{m.frequencyPerDay ?? 1}x/day • {Array.isArray(m.times) ? m.times.join(", ") : "—"}
                      </p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        Start {m.startOn ? format(m.startOn.toDate(), "dd MMM yyyy") : "—"}
                        {m.endOn ? ` • End ${format(m.endOn.toDate(), "dd MMM yyyy")}` : ""}
                      </p>
                      {m.notes ? <p className="text-xs mt-1 text-neutral-600">{m.notes}</p> : null}
                    </div>
                    <button className="text-xs underline text-red-600" onClick={() => del("medications", m.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Vaccines & Parasites */}
      {activeTab === "Vaccines & Parasites" ? (
        <section className="grid lg:grid-cols-2 gap-4">
          <div className="border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Vaccinations</h2>
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setVacModal(true)}>Add</button>
            </div>
            <div className="mt-3 space-y-2">
              {vaccines.length === 0 ? <p className="text-sm text-neutral-600">No vaccination records.</p> : vaccines.map(v => (
                <div key={v.id} className="border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{v.name}</p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        Given {format(v.administeredOn.toDate(), "dd MMM yyyy")}
                        {v.dueOn ? ` • Due ${format(v.dueOn.toDate(), "dd MMM yyyy")}` : ""}
                      </p>
                      {v.brand ? <p className="text-xs text-neutral-600 mt-0.5">Brand: {v.brand} {v.batchNo ? `• Batch ${v.batchNo}` : ""}</p> : null}
                      {v.notes ? <p className="text-xs mt-1 text-neutral-600">{v.notes}</p> : null}
                    </div>
                    <button className="text-xs underline text-red-600" onClick={() => del("vaccinations", v.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Deworming & Spot-on</h2>
              <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setParModal(true)}>Add</button>
            </div>
            <div className="mt-3 space-y-2">
              {parasites.length === 0 ? <p className="text-sm text-neutral-600">No parasite treatments.</p> : parasites.map(p => (
                <div key={p.id} className="border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.type === "DEWORMING" ? "Deworming" : "Spot-on"} — {p.product}</p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        Given {format(p.administeredOn.toDate(), "dd MMM yyyy")}
                        {p.dueOn ? ` • Due ${format(p.dueOn.toDate(), "dd MMM yyyy")}` : ""}
                      </p>
                      {p.dose ? <p className="text-xs text-neutral-600 mt-0.5">Dose: {p.dose}</p> : null}
                      {p.notes ? <p className="text-xs mt-1 text-neutral-600">{p.notes}</p> : null}
                    </div>
                    <button className="text-xs underline text-red-600" onClick={() => del("parasiteTreatments", p.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Grooming */}
      {activeTab === "Grooming" ? (
        <section className="border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Grooming records</h2>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setGroomModal(true)}>Add</button>
          </div>
          <div className="mt-3 space-y-2">
            {grooming.length === 0 ? <p className="text-sm text-neutral-600">No grooming records.</p> : grooming.map(g => (
              <div key={g.id} className="border rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{g.service ?? "Grooming"}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {format(g.date.toDate(), "dd MMM yyyy")} • Groomer {g.groomer ?? "—"}
                      {g.nextDueOn ? ` • Next due ${format(g.nextDueOn.toDate(), "dd MMM yyyy")}` : ""}
                    </p>
                    {(g.coatCondition || g.skinCondition) ? (
                      <p className="text-xs text-neutral-600 mt-1">
                        {g.coatCondition ? `Coat: ${g.coatCondition}` : ""}{g.coatCondition && g.skinCondition ? " • " : ""}{g.skinCondition ? `Skin: ${g.skinCondition}` : ""}
                      </p>
                    ) : null}
                    {g.notes ? <p className="text-xs mt-1 text-neutral-600">{g.notes}</p> : null}
                  </div>
                  <button className="text-xs underline text-red-600" onClick={() => del("grooming", g.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Training */}
      {activeTab === "Training" ? (
        <section className="border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Training sessions</h2>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setTrainModal(true)}>Add</button>
          </div>
          <div className="mt-3 space-y-2">
            {training.length === 0 ? <p className="text-sm text-neutral-600">No training sessions.</p> : training.map(t => (
              <div key={t.id} className="border rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.sessionType ?? "Training"}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {format(t.date.toDate(), "dd MMM yyyy")} • Trainer {t.trainer ?? "—"}
                      {t.nextSessionOn ? ` • Next ${format(t.nextSessionOn.toDate(), "dd MMM yyyy")}` : ""}
                    </p>
                    {t.focus ? <p className="text-xs mt-1"><span className="text-neutral-600">Focus:</span> {t.focus}</p> : null}
                    {t.progress ? <p className="text-xs mt-1"><span className="text-neutral-600">Progress:</span> {t.progress}</p> : null}
                    {t.homework ? <p className="text-xs mt-1 text-neutral-600">Homework: {t.homework}</p> : null}
                  </div>
                  <button className="text-xs underline text-red-600" onClick={() => del("training", t.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Meals */}
      {activeTab === "Meals" ? (
        <section className="border rounded-2xl p-4">
          <h2 className="font-semibold">Meal preferences & schedule</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Prototype: saved as a single “meal plan” doc. You can store allergies, preferred proteins, timings, etc.
          </p>

          <div className="mt-4 grid lg:grid-cols-2 gap-4">
            <Field label="Allergies / intolerances">
              <textarea
                className="w-full border rounded-lg p-2"
                rows={4}
                value={mealPlan?.allergies ?? ""}
                onChange={(e) => setMealPlan({ ...(mealPlan ?? {}), allergies: e.target.value })}
              />
            </Field>

            <Field label="Preferences (likes/dislikes)">
              <textarea
                className="w-full border rounded-lg p-2"
                rows={4}
                value={mealPlan?.preferences ?? ""}
                onChange={(e) => setMealPlan({ ...(mealPlan ?? {}), preferences: e.target.value })}
              />
            </Field>

            <Field label="Daily schedule (simple text)">
              <textarea
                className="w-full border rounded-lg p-2"
                rows={6}
                placeholder={"Example:\n08:00 - Breakfast: eggs + rice\n14:00 - Snack: chicken broth\n20:00 - Dinner: fish + pumpkin"}
                value={mealPlan?.scheduleText ?? ""}
                onChange={(e) => setMealPlan({ ...(mealPlan ?? {}), scheduleText: e.target.value })}
              />
            </Field>

            <Field label="Notes">
              <textarea
                className="w-full border rounded-lg p-2"
                rows={6}
                value={mealPlan?.notes ?? ""}
                onChange={(e) => setMealPlan({ ...(mealPlan ?? {}), notes: e.target.value })}
              />
            </Field>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
              disabled={mealSaving}
              onClick={async () => {
                setMealSaving(true);
                try {
                  const { setDoc } = await import("firebase/firestore");
                  await setDoc(doc(db, "pets", petId, "profile", "mealPlan"), { ...(mealPlan ?? {}), updatedAt: Timestamp.now() }, { merge: true });
                } finally {
                  setMealSaving(false);
                }
              }}
            >
              {mealSaving ? "Saving..." : "Save meal plan"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Activity */}
      {activeTab === "Activity" ? (
        <section className="border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Activity log</h2>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setActModal(true)}>Add</button>
          </div>
          <div className="mt-3 space-y-2">
            {activities.length === 0 ? <p className="text-sm text-neutral-600">No activities.</p> : activities.map(a => (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.type} • {a.durationMin} min • {a.intensity}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">{format(a.date.toDate(), "dd MMM yyyy")}</p>
                    {a.notes ? <p className="text-xs mt-1 text-neutral-600">{a.notes}</p> : null}
                  </div>
                  <button className="text-xs underline text-red-600" onClick={() => del("activities", a.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Transport */}
      {activeTab === "Transport" ? (
        <section className="border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pick-up / drop schedules</h2>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setTransModal(true)}>Add</button>
          </div>
          <div className="mt-3 space-y-2">
            {transport.length === 0 ? <p className="text-sm text-neutral-600">No transport schedules.</p> : transport.map(t => (
              <div key={t.id} className="border rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.purpose ?? "Transport"} • {t.status}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {format(t.date.toDate(), "dd MMM yyyy")}
                      {t.pickupTime ? ` • Pickup ${t.pickupTime}` : ""}{t.dropTime ? ` • Drop ${t.dropTime}` : ""}
                    </p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {t.from ?? "—"} → {t.to ?? "—"} • Driver {t.driver ?? "—"}
                    </p>
                    {t.notes ? <p className="text-xs mt-1 text-neutral-600">{t.notes}</p> : null}
                  </div>
                  <button className="text-xs underline text-red-600" onClick={() => del("transport", t.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Documents */}
      {activeTab === "Documents" ? (
        <section className="border rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Documents vault</h2>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setDocModal(true)}>Upload</button>
          </div>
          <p className="text-sm text-neutral-600 mt-1">
            Upload vaccination cards, blood reports, prescriptions, certificates, etc.
          </p>
          <div className="mt-3 space-y-2">
            {docs.length === 0 ? <p className="text-sm text-neutral-600">No documents.</p> : docs.map(d => (
              <div key={d.id} className="border rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.kind}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {d.filename} • {format(d.uploadedAt.toDate(), "dd MMM yyyy")}
                    </p>
                    {d.notes ? <p className="text-xs mt-1 text-neutral-600">{d.notes}</p> : null}
                    <a className="text-xs underline mt-2 inline-block" href={d.url} target="_blank" rel="noreferrer">Open</a>
                  </div>
                  <button className="text-xs underline text-red-600" onClick={() => del("documents", d.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Modals */}
      <Modal open={weightModal} onClose={() => setWeightModal(false)} title="Add weight entry">
        <div className="space-y-2">
          <Field label="Date">
            <input type="date" className="w-full border rounded-lg p-2" value={weightForm.date} onChange={(e) => setWeightForm({ ...weightForm, date: e.target.value })} />
          </Field>
          <Field label="Weight (kg) *">
            <input className="w-full border rounded-lg p-2" value={weightForm.weightKg} onChange={(e) => setWeightForm({ ...weightForm, weightKg: e.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={weightForm.notes} onChange={(e) => setWeightForm({ ...weightForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addWeight}>Save</button>
        </div>
      </Modal>

      <Modal open={visitModal} onClose={() => setVisitModal(false)} title="Add vet visit">
        <div className="space-y-2">
          <Field label="Visit date *">
            <input type="date" className="w-full border rounded-lg p-2" value={visitForm.visitOn} onChange={(e) => setVisitForm({ ...visitForm, visitOn: e.target.value })} />
          </Field>
          <Field label="Vet">
            <select className="w-full border rounded-lg p-2" value={visitForm.vetId} onChange={(e) => setVisitForm({ ...visitForm, vetId: e.target.value })}>
              <option value="">—</option>
              {vets.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Reason">
            <input className="w-full border rounded-lg p-2" value={visitForm.reason} onChange={(e) => setVisitForm({ ...visitForm, reason: e.target.value })} />
          </Field>
          <Field label="Diagnosis">
            <input className="w-full border rounded-lg p-2" value={visitForm.diagnosis} onChange={(e) => setVisitForm({ ...visitForm, diagnosis: e.target.value })} />
          </Field>
          <Field label="Prognosis">
            <input className="w-full border rounded-lg p-2" value={visitForm.prognosis} onChange={(e) => setVisitForm({ ...visitForm, prognosis: e.target.value })} />
          </Field>
          <Field label="Follow-up date">
            <input type="date" className="w-full border rounded-lg p-2" value={visitForm.followUpOn} onChange={(e) => setVisitForm({ ...visitForm, followUpOn: e.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addVisit}>Save</button>
        </div>
      </Modal>

      <Modal open={medModal} onClose={() => setMedModal(false)} title="Add medication">
        <div className="space-y-2">
          <Field label="Medication name *">
            <input className="w-full border rounded-lg p-2" value={medForm.name} onChange={(e) => setMedForm({ ...medForm, name: e.target.value })} />
          </Field>
          <Field label="Dosage (e.g., 1 tab, 5 ml)">
            <input className="w-full border rounded-lg p-2" value={medForm.dosage} onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start date *">
              <input type="date" className="w-full border rounded-lg p-2" value={medForm.startOn} onChange={(e) => setMedForm({ ...medForm, startOn: e.target.value })} />
            </Field>
            <Field label="End date (optional)">
              <input type="date" className="w-full border rounded-lg p-2" value={medForm.endOn} onChange={(e) => setMedForm({ ...medForm, endOn: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Times (HH:MM, comma-separated)">
              <input className="w-full border rounded-lg p-2" value={medForm.timesCsv} onChange={(e) => setMedForm({ ...medForm, timesCsv: e.target.value })} />
            </Field>
            <Field label="Frequency/day (optional)">
              <input className="w-full border rounded-lg p-2" value={medForm.frequencyPerDay} onChange={(e) => setMedForm({ ...medForm, frequencyPerDay: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={medForm.notes} onChange={(e) => setMedForm({ ...medForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addMedication}>Save + create reminders</button>
        </div>
      </Modal>

      <Modal open={vacModal} onClose={() => setVacModal(false)} title="Add vaccination">
        <div className="space-y-2">
          <Field label="Vaccine name *">
            <input className="w-full border rounded-lg p-2" value={vacForm.name} onChange={(e) => setVacForm({ ...vacForm, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Administered on *">
              <input type="date" className="w-full border rounded-lg p-2" value={vacForm.administeredOn} onChange={(e) => setVacForm({ ...vacForm, administeredOn: e.target.value })} />
            </Field>
            <Field label="Next due on">
              <input type="date" className="w-full border rounded-lg p-2" value={vacForm.dueOn} onChange={(e) => setVacForm({ ...vacForm, dueOn: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Brand">
              <input className="w-full border rounded-lg p-2" value={vacForm.brand} onChange={(e) => setVacForm({ ...vacForm, brand: e.target.value })} />
            </Field>
            <Field label="Batch #">
              <input className="w-full border rounded-lg p-2" value={vacForm.batchNo} onChange={(e) => setVacForm({ ...vacForm, batchNo: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={vacForm.notes} onChange={(e) => setVacForm({ ...vacForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addVaccination}>Save</button>
        </div>
      </Modal>

      <Modal open={parModal} onClose={() => setParModal(false)} title="Add deworming / spot-on">
        <div className="space-y-2">
          <Field label="Type">
            <select className="w-full border rounded-lg p-2" value={parForm.type} onChange={(e) => setParForm({ ...parForm, type: e.target.value as any })}>
              <option value="DEWORMING">Deworming</option>
              <option value="SPOT_ON">Spot-on</option>
            </select>
          </Field>
          <Field label="Product *">
            <input className="w-full border rounded-lg p-2" value={parForm.product} onChange={(e) => setParForm({ ...parForm, product: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Administered on *">
              <input type="date" className="w-full border rounded-lg p-2" value={parForm.administeredOn} onChange={(e) => setParForm({ ...parForm, administeredOn: e.target.value })} />
            </Field>
            <Field label="Next due on">
              <input type="date" className="w-full border rounded-lg p-2" value={parForm.dueOn} onChange={(e) => setParForm({ ...parForm, dueOn: e.target.value })} />
            </Field>
          </div>
          <Field label="Dose">
            <input className="w-full border rounded-lg p-2" value={parForm.dose} onChange={(e) => setParForm({ ...parForm, dose: e.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={parForm.notes} onChange={(e) => setParForm({ ...parForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addParasite}>Save</button>
        </div>
      </Modal>

      <Modal open={groomModal} onClose={() => setGroomModal(false)} title="Add grooming record">
        <div className="space-y-2">
          <Field label="Date *">
            <input type="date" className="w-full border rounded-lg p-2" value={groomForm.date} onChange={(e) => setGroomForm({ ...groomForm, date: e.target.value })} />
          </Field>
          <Field label="Service">
            <input className="w-full border rounded-lg p-2" value={groomForm.service} onChange={(e) => setGroomForm({ ...groomForm, service: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Groomer">
              <input className="w-full border rounded-lg p-2" value={groomForm.groomer} onChange={(e) => setGroomForm({ ...groomForm, groomer: e.target.value })} />
            </Field>
            <Field label="Next due on">
              <input type="date" className="w-full border rounded-lg p-2" value={groomForm.nextDueOn} onChange={(e) => setGroomForm({ ...groomForm, nextDueOn: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Coat condition">
              <input className="w-full border rounded-lg p-2" value={groomForm.coatCondition} onChange={(e) => setGroomForm({ ...groomForm, coatCondition: e.target.value })} />
            </Field>
            <Field label="Skin condition">
              <input className="w-full border rounded-lg p-2" value={groomForm.skinCondition} onChange={(e) => setGroomForm({ ...groomForm, skinCondition: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={groomForm.notes} onChange={(e) => setGroomForm({ ...groomForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addGrooming}>Save</button>
        </div>
      </Modal>

      <Modal open={trainModal} onClose={() => setTrainModal(false)} title="Add training session">
        <div className="space-y-2">
          <Field label="Date *">
            <input type="date" className="w-full border rounded-lg p-2" value={trainForm.date} onChange={(e) => setTrainForm({ ...trainForm, date: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Session type">
              <input className="w-full border rounded-lg p-2" value={trainForm.sessionType} onChange={(e) => setTrainForm({ ...trainForm, sessionType: e.target.value })} />
            </Field>
            <Field label="Trainer">
              <input className="w-full border rounded-lg p-2" value={trainForm.trainer} onChange={(e) => setTrainForm({ ...trainForm, trainer: e.target.value })} />
            </Field>
          </div>
          <Field label="Focus">
            <input className="w-full border rounded-lg p-2" value={trainForm.focus} onChange={(e) => setTrainForm({ ...trainForm, focus: e.target.value })} />
          </Field>
          <Field label="Progress">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={trainForm.progress} onChange={(e) => setTrainForm({ ...trainForm, progress: e.target.value })} />
          </Field>
          <Field label="Homework">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={trainForm.homework} onChange={(e) => setTrainForm({ ...trainForm, homework: e.target.value })} />
          </Field>
          <Field label="Next session on">
            <input type="date" className="w-full border rounded-lg p-2" value={trainForm.nextSessionOn} onChange={(e) => setTrainForm({ ...trainForm, nextSessionOn: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addTraining}>Save</button>
        </div>
      </Modal>

      <Modal open={actModal} onClose={() => setActModal(false)} title="Add activity">
        <div className="space-y-2">
          <Field label="Date *">
            <input type="date" className="w-full border rounded-lg p-2" value={actForm.date} onChange={(e) => setActForm({ ...actForm, date: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <input className="w-full border rounded-lg p-2" value={actForm.type} onChange={(e) => setActForm({ ...actForm, type: e.target.value })} />
            </Field>
            <Field label="Duration (min)">
              <input className="w-full border rounded-lg p-2" value={actForm.durationMin} onChange={(e) => setActForm({ ...actForm, durationMin: e.target.value })} />
            </Field>
          </div>
          <Field label="Intensity">
            <select className="w-full border rounded-lg p-2" value={actForm.intensity} onChange={(e) => setActForm({ ...actForm, intensity: e.target.value })}>
              <option>Low</option>
              <option>Moderate</option>
              <option>High</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={actForm.notes} onChange={(e) => setActForm({ ...actForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addActivity}>Save</button>
        </div>
      </Modal>

      <Modal open={transModal} onClose={() => setTransModal(false)} title="Add pick-up / drop schedule">
        <div className="space-y-2">
          <Field label="Date *">
            <input type="date" className="w-full border rounded-lg p-2" value={transForm.date} onChange={(e) => setTransForm({ ...transForm, date: e.target.value })} />
          </Field>
          <Field label="Purpose">
            <input className="w-full border rounded-lg p-2" value={transForm.purpose} onChange={(e) => setTransForm({ ...transForm, purpose: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Pickup time">
              <input className="w-full border rounded-lg p-2" placeholder="09:30" value={transForm.pickupTime} onChange={(e) => setTransForm({ ...transForm, pickupTime: e.target.value })} />
            </Field>
            <Field label="Drop time">
              <input className="w-full border rounded-lg p-2" placeholder="13:00" value={transForm.dropTime} onChange={(e) => setTransForm({ ...transForm, dropTime: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <input className="w-full border rounded-lg p-2" value={transForm.from} onChange={(e) => setTransForm({ ...transForm, from: e.target.value })} />
            </Field>
            <Field label="To">
              <input className="w-full border rounded-lg p-2" value={transForm.to} onChange={(e) => setTransForm({ ...transForm, to: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Driver">
              <input className="w-full border rounded-lg p-2" value={transForm.driver} onChange={(e) => setTransForm({ ...transForm, driver: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="w-full border rounded-lg p-2" value={transForm.status} onChange={(e) => setTransForm({ ...transForm, status: e.target.value })}>
                <option>Scheduled</option>
                <option>In progress</option>
                <option>Completed</option>
                <option>Cancelled</option>
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={transForm.notes} onChange={(e) => setTransForm({ ...transForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2" onClick={addTransport}>Save</button>
        </div>
      </Modal>

      <Modal open={docModal} onClose={() => setDocModal(false)} title="Upload document">
        <div className="space-y-2">
          <Field label="Kind">
            <select className="w-full border rounded-lg p-2" value={docForm.kind} onChange={(e) => setDocForm({ ...docForm, kind: e.target.value })}>
              {["Vaccination Card","Blood Report","Prescription","X-ray / Scan","Certificate","Photo","Other"].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="File *">
            <input type="file" className="w-full" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Notes">
            <textarea className="w-full border rounded-lg p-2" rows={3} value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} />
          </Field>
          <button className="w-full rounded-lg bg-black text-white py-2 disabled:opacity-60" disabled={docUploading} onClick={uploadDocument}>
            {docUploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </Modal>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-neutral-600">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
