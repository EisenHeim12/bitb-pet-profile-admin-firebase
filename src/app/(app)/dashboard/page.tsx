"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  getCountFromServer,
  orderBy,
  limit,
  query,
  where,
  getDocs,
  getDocsFromCache,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import PetSearch from "@/components/PetSearch";

type Reminder = {
  id: string;
  petId: string;
  petName?: string;
  type: string;
  title: string;
  dueAt: Timestamp;
  status: "OPEN" | "DONE" | "SNOOZED";
};

export default function Dashboard() {
  const [counts, setCounts] = useState<{ clients: number; pets: number; vets: number } | null>(
    null
  );
  const [countsLoading, setCountsLoading] = useState(true);

  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [remindersLoading, setRemindersLoading] = useState(true);

  const [err, setErr] = useState<string | null>(null);

  const upcomingCutoff = useMemo(() => {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() + 14);
    return d;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr(null);
      setCountsLoading(true);
      setRemindersLoading(true);

      // Build reminders query once
      const qRem = query(
        collection(db, "reminders"),
        where("status", "==", "OPEN"),
        where("dueAt", "<=", Timestamp.fromDate(upcomingCutoff)),
        orderBy("dueAt", "asc"),
        limit(20)
      );

      try {
        // ✅ Optional: show cached reminders instantly (if available)
        // This helps after the first load (cache warm). If cache is empty, it will throw and we ignore it.
        try {
          const cacheSnap = await getDocsFromCache(qRem);
          if (!cancelled) {
            setReminders(cacheSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
            setRemindersLoading(false); // show something while server request is in-flight
          }
        } catch {
          // ignore cache miss
        }

        // ✅ REAL speed-up: run counts + server reminders in parallel (instead of sequential)
        const countsPromise = Promise.all([
          getCountFromServer(collection(db, "clients")),
          getCountFromServer(collection(db, "pets")),
          getCountFromServer(collection(db, "vets")),
        ]);

        const remindersPromise = getDocs(qRem);

        const [[c, p, v], remSnap] = await Promise.all([countsPromise, remindersPromise]);

        if (!cancelled) {
          setCounts({
            clients: c.data().count,
            pets: p.data().count,
            vets: v.data().count,
          });
          setCountsLoading(false);

          setReminders(remSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
          setRemindersLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? "Failed to load dashboard data");
          setCountsLoading(false);
          setRemindersLoading(false);
          if (counts === null) setCounts(null);
          if (reminders === null) setReminders([]);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingCutoff]);

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Upcoming reminders (next 14 days), quick search, and core counts.
          </p>
          {err ? <p className="text-sm text-red-600 mt-2">{err}</p> : null}
        </div>

        <div className="flex items-center gap-3">
          <Link className="text-sm underline" href="/clients">
            Clients
          </Link>
          <Link className="text-sm underline" href="/pets">
            Pets
          </Link>
          <Link className="text-sm underline" href="/reminders">
            Reminders
          </Link>
          <Link className="text-sm underline" href="/vets">
            Vets
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Stat title="Clients" value={counts?.clients ?? 0} loading={countsLoading} />
        <Stat title="Pets" value={counts?.pets ?? 0} loading={countsLoading} />
        <Stat title="Vets" value={counts?.vets ?? 0} loading={countsLoading} />
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Quick pet search</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Search by pet name, breed, or microchip number.
          </p>
          <div className="mt-3">
            <PetSearch />
          </div>
        </div>

        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold">Upcoming reminders</h2>
          <p className="text-sm text-neutral-600 mt-1">These are due within 14 days.</p>

          <div className="mt-3 space-y-2">
            {remindersLoading ? (
              <p className="text-sm text-neutral-600">Loading reminders…</p>
            ) : (reminders ?? []).length === 0 ? (
              <p className="text-sm text-neutral-600">No upcoming reminders. Good.</p>
            ) : (
              (reminders ?? []).map((r) => (
                <div key={r.id} className={cn("border rounded-xl p-3", "hover:bg-neutral-50")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        Due {format(r.dueAt.toDate(), "dd MMM yyyy, hh:mm a")} • {r.type}
                      </p>
                    </div>
                    <Link className="text-xs underline" href={`/pets/${r.petId}`}>
                      Open pet
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        Tip: This prototype stores everything in Firestore. Keep it admin-only. Don’t be sloppy
        with access control.
      </div>
    </main>
  );
}

function Stat({ title, value, loading }: { title: string; value: number; loading: boolean }) {
  return (
    <div className="border rounded-2xl p-4">
      <p className="text-sm text-neutral-600">{title}</p>
      {loading ? (
        <p className="text-sm text-neutral-600 mt-2">Loading…</p>
      ) : (
        <p className="text-3xl font-semibold mt-1">{value}</p>
      )}
    </div>
  );
}
