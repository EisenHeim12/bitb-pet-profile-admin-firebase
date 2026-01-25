"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";

export default function PetSearch() {
  const [pets, setPets] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [qText, setQText] = useState("");

  useEffect(() => {
    const unsubPets = onSnapshot(query(collection(db, "pets"), orderBy("createdAt", "desc")), (snap) => {
      setPets(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const unsubClients = onSnapshot(query(collection(db, "clients"), orderBy("createdAt", "desc")), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => { unsubPets(); unsubClients(); };
  }, []);

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach(c => m.set(c.id, c.name));
    return m;
  }, [clients]);

  const results = useMemo(() => {
    const needle = qText.trim().toLowerCase();
    if (!needle) return [];
    return pets
      .filter(p =>
        (p.name ?? "").toLowerCase().includes(needle) ||
        (p.breed ?? "").toLowerCase().includes(needle) ||
        (p.microchipNo ?? "").toLowerCase().includes(needle) ||
        (clientNameById.get(p.clientId) ?? "").toLowerCase().includes(needle)
      )
      .slice(0, 10);
  }, [pets, qText, clientNameById]);

  return (
    <div className="space-y-2">
      <input
        className="w-full border rounded-lg p-2"
        placeholder="Type to search..."
        value={qText}
        onChange={(e) => setQText(e.target.value)}
      />
      {qText.trim() && (
        <div className="border rounded-xl divide-y overflow-hidden">
          {results.length === 0 ? (
            <div className="p-3 text-sm text-neutral-600">No matches.</div>
          ) : results.map(p => (
            <Link
              key={p.id}
              href={`/pets/${p.id}`}
              className={cn("block p-3 hover:bg-neutral-50")}
            >
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-neutral-600 mt-0.5">
                {clientNameById.get(p.clientId) ?? "—"} • {p.breed ?? "—"} • Microchip {p.microchipNo ?? "—"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
