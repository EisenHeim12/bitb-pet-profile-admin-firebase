"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState("loading");
        router.replace("/login");
        return;
      }
      const email = (user.email ?? "").toLowerCase();
const cfg = await getDoc(doc(db, "config", "admins"));
const data = cfg.exists() ? cfg.data() : {};

const allowedUids = Array.isArray(data.allowedUids) ? data.allowedUids.map(String) : [];
const allowedEmails = Array.isArray(data.emails) ? data.emails.map(String) : []; // fallback

const okByUid = allowedUids.length > 0 && allowedUids.includes(user.uid);
const okByEmail = allowedEmails.length > 0 && user.email && allowedEmails.includes(user.email);

if (!okByUid && !okByEmail) {
  setState("denied");
  return;
}

setState("ok");

    });
    return () => unsub();
  }, [router]);

  if (state === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-neutral-600">Checking access…</p>
      </main>
    );
  }

if (state === "denied") {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md border rounded-2xl p-6">
        <h1 className="text-lg font-semibold">Access denied</h1>

        <p className="text-sm text-neutral-600 mt-2">
          Access denied. Ask the admin to authorize your account.
        </p>

        <p className="text-sm text-neutral-600 mt-2">
          Fix: ask the admin to authorize your account, then refresh.
        </p>

        <button
          className="mt-4 rounded-lg border px-3 py-2 text-sm"
          onClick={() => router.refresh()}
        >
          Refresh
        </button>
      </div>
    </main>
  );
}

  return <>{children}</>;
}
