"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/pets", label: "Pets" },
  { href: "/vets", label: "Vets" },
  { href: "/reminders", label: "Reminders" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-r bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">BitB Admin</p>
          <p className="text-xs text-neutral-600">Pet Profile Manager</p>
        </div>
      </div>

      <nav className="mt-6 space-y-1">
        {nav.map((i) => {
          const active = pathname === i.href || pathname.startsWith(i.href + "/");
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm border",
                active ? "bg-black text-white border-black" : "hover:bg-neutral-50"
              )}
            >
              {i.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 text-xs text-neutral-500 leading-relaxed">
        <p className="font-medium text-neutral-900">Prototype scope</p>
        <p className="mt-1">
          This is an internal CRUD dashboard + docs vault + in-app reminders.
          External automations (WhatsApp, vet booking integrations, driver routing) are separate projects.
        </p>
      </div>
    </aside>
  );
}
