"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SettingsPage() {
  return (
    <main className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-neutral-600 mt-1">Admin-only basics.</p>
        </div>
        <Link className="text-sm underline" href="/dashboard">Dashboard</Link>
      </div>

      <div className="border rounded-2xl p-4">
        <p className="text-sm text-neutral-600">Signed in as</p>
        <p className="font-medium mt-1">{auth.currentUser?.email ?? "—"}</p>

        <button
          className="mt-4 rounded-lg border px-3 py-2 text-sm"
          onClick={() => signOut(auth)}
        >
          Sign out
        </button>

        <div className="mt-6 text-sm text-neutral-600 leading-relaxed">
          <p className="font-medium text-neutral-900">Admin access control</p>
          <p className="mt-2">
            This app is locked by Firestore rules using <code className="px-1 py-0.5 bg-neutral-100 rounded">config/admins</code>.
            Put your admin email(s) in <code className="px-1 py-0.5 bg-neutral-100 rounded">emails</code> array.
          </p>
        </div>
      </div>
    </main>
  );
}
