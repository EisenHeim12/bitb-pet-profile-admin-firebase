"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Users, PawPrint, Stethoscope, Clock, Plus } from "lucide-react";

type Reminder = {
  id: string;
  petId: string;
  petName?: string;
  type: string;
  title: string;
  dueAt: Timestamp;
  status: "OPEN" | "DONE" | "SNOOZED";
};

function NavButton({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2",
        "rounded-lg border px-3 py-2 text-sm",
        "text-neutral-900 bg-white border-neutral-200",
        "no-underline hover:no-underline",
        "hover:bg-neutral-50 hover:border-neutral-300 transition",
        "focus:outline-none focus:ring-2 focus:ring-black/20"
      )}
      title={label}
      aria-label={label}
    >
      <Icon className="w-4 h-4" strokeWidth={2} />
      <span>{label}</span>
    </Link>
  );
}

function StatCard({
  title,
  value,
  loading,
  href,
  Icon,
  addHref,
}: {
  title: string;
  value: number;
  loading: boolean;
  href: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  addHref?: string;
}) {
  const router = useRouter();
  const open = () => router.push(href);

  return (
    <div
      className={cn(
        "relative border rounded-2xl p-4 transition cursor-pointer",
        "hover:bg-neutral-50 hover:border-neutral-300",
        "focus:outline-none focus:ring-2 focus:ring-black/20"
      )}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      title={`Open ${title}`}
      aria-label={`Open ${title}`}
    >
      {/* Top row: title left, icon right (icon gets a fixed 7x7 box to align with +) */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-600">{title}</p>

        <div className="w-7 h-7 flex items-center justify-center">
          <Icon className="w-4 h-4 text-neutral-900" strokeWidth={2} />
        </div>
      </div>

      {/* Value */}
      {loading ? (
        <p className="text-sm text-neutral-600 mt-2">Loading…</p>
      ) : (
        <p className="text-3xl font-semibold mt-1">{value}</p>
      )}

      {/* + button pinned bottom-right (same box size as icon container above) */}
      {addHref ? (
        <Link
          href={addHref}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute right-4 bottom-4",
            "w-7 h-7 rounded-full border border-neutral-200 bg-white",
            "flex items-center justify-center",
            "transition-transform",
            "hover:scale-110 hover:border-neutral-300 hover:bg-neutral-50",
            "focus:outline-none focus:ring-2 focus:ring-black/20",
            "no-underline hover:no-underline"
          )}
          title={`Add ${title.slice(0, -1)}`}
          aria-label={`Add ${title.slice(0, -1)}`}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
        </Link>
      ) : null}
    </div>
  );
}

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

      const qRem = query(
        collection(db, "reminders"),
        where("status", "==", "OPEN"),
        where("dueAt", "<=", Timestamp.fromDate(upcomingCutoff)),
        orderBy("dueAt", "asc"),
        limit(20)
      );

      try {
        try {
          const cacheSnap = await getDocsFromCache(qRem);
          if (!cancelled) {
            setReminders(cacheSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
            setRemindersLoading(false);
          }
        } catch {
          // ignore cache miss
        }

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

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <NavButton href="/clients" label="Clients" Icon={Users} />
          <NavButton href="/pets" label="Pets" Icon={PawPrint} />
          <NavButton href="/reminders" label="Reminders" Icon={Clock} />
          <NavButton href="/vets" label="Vets" Icon={Stethoscope} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard
          title="Clients"
          value={counts?.clients ?? 0}
          loading={countsLoading}
          href="/clients"
          addHref="/clients?new=1"
          Icon={Users}
        />
        <StatCard
          title="Pets"
          value={counts?.pets ?? 0}
          loading={countsLoading}
          href="/pets"
          addHref="/pets?new=1"
          Icon={PawPrint}
        />
        <StatCard
          title="Vets"
          value={counts?.vets ?? 0}
          loading={countsLoading}
          href="/vets"
          addHref="/vets?new=1"
          Icon={Stethoscope}
        />
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
        Tip: This prototype stores everything in Firestore. Keep it admin-only. Don’t be sloppy with
        access control.
      </div>
    </main>
  );
}
