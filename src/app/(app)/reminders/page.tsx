"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";

type Reminder = any;

export default function RemindersPage() {
  const [status, setStatus] = useState<"OPEN" | "DONE" | "SNOOZED">("OPEN");
  const [items, setItems] = useState<Reminder[]>([]);

  useEffect(() => {
    const qy = query(
      collection(db, "reminders"),
      where("status", "==", status),
      orderBy("dueAt", "asc")
    );
    return onSnapshot(qy, (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
  }, [status]);

  const overdueCount = useMemo(() => {
    const now = new Date();
    return items.filter(i => i.dueAt?.toDate?.() && i.dueAt.toDate() < now).length;
  }, [items]);

  async function markDone(id: string) {
    await updateDoc(doc(db, "reminders", id), { status: "DONE", doneAt: Timestamp.now() });
  }

  async function snooze(id: string, minutes: number) {
    const until = new Date();
    until.setMinutes(until.getMinutes() + minutes);
    await updateDoc(doc(db, "reminders", id), { status: "SNOOZED", snoozedUntil: Timestamp.fromDate(until) });
  }

  async function reopen(id: string) {
    await updateDoc(doc(db, "reminders", id), { status: "OPEN" });
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reminders</h1>
          <p className="text-sm text-neutral-600 mt-1">
            In-app reminders. This is not WhatsApp/SMS yet.
          </p>
        </div>
        <Link className="text-sm underline" href="/dashboard">Dashboard</Link>
      </div>

      <div className="flex items-center gap-2">
        <button className={btn(status === "OPEN")} onClick={() => setStatus("OPEN")}>Open</button>
        <button className={btn(status === "SNOOZED")} onClick={() => setStatus("SNOOZED")}>Snoozed</button>
        <button className={btn(status === "DONE")} onClick={() => setStatus("DONE")}>Done</button>
        {status === "OPEN" ? <span className="text-sm text-neutral-600 ml-3">Overdue: {overdueCount}</span> : null}
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing here.</p>
        ) : items.map(r => (
          <div key={r.id} className="border rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Due {r.dueAt?.toDate ? format(r.dueAt.toDate(), "dd MMM yyyy, hh:mm a") : "—"} • {r.type}
                </p>
                {r.petId ? <Link className="text-xs underline mt-2 inline-block" href={`/pets/${r.petId}`}>Open pet</Link> : null}
              </div>

              <div className="flex items-center gap-2">
                {status === "OPEN" ? (
                  <>
                    <button className="text-xs underline" onClick={() => snooze(r.id, 60)}>Snooze 1h</button>
                    <button className="text-xs underline" onClick={() => snooze(r.id, 24 * 60)}>Snooze 1d</button>
                    <button className="text-xs underline text-green-700" onClick={() => markDone(r.id)}>Done</button>
                  </>
                ) : null}
                {status === "SNOOZED" ? (
                  <button className="text-xs underline" onClick={() => reopen(r.id)}>Reopen</button>
                ) : null}
                {status === "DONE" ? (
                  <button className="text-xs underline" onClick={() => reopen(r.id)}>Reopen</button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function btn(active: boolean) {
  return [
    "px-3 py-1.5 rounded-lg text-sm border",
    active ? "bg-black text-white border-black" : "hover:bg-neutral-50",
  ].join(" ");
}
