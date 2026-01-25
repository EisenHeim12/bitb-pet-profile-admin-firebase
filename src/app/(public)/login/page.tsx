"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/dashboard");
    } catch (e: any) {
      setErr(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold">BitB Pet Profile Admin</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Admin-only salon dashboard. Use your Firebase Auth email/password.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            className="w-full border rounded-lg p-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full border rounded-lg p-2"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <button
            className="w-full rounded-lg bg-black text-white py-2 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-5 text-xs text-neutral-600 leading-relaxed">
          <p className="font-medium">First-time setup checklist:</p>
          <ol className="list-decimal ml-4 mt-1 space-y-1">
            <li>Create a Firebase project (Firestore + Auth + Storage).</li>
            <li>Create your admin user in Authentication.</li>
            <li>Create Firestore doc <code className="px-1 py-0.5 bg-neutral-100 rounded">config/admins</code> with field <code className="px-1 py-0.5 bg-neutral-100 rounded">emails</code> (array) containing your admin email.</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
