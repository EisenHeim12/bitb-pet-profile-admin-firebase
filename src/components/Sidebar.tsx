"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  PawPrint,
  Stethoscope,
  Clock,
  Settings as SettingsIcon,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/clients", label: "Clients", Icon: Users },
  { href: "/pets", label: "Pets", Icon: PawPrint },
  { href: "/vets", label: "Vets", Icon: Stethoscope },
  { href: "/reminders", label: "Reminders", Icon: Clock },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-r bg-white p-4">
      <div>
        <p className="text-sm font-semibold">BitB Admin</p>
        <p className="text-xs text-neutral-600">Pet Profile Manager</p>
      </div>

      <nav className="mt-6 space-y-2">
        {nav.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm border transition",
                active
                  ? "bg-black text-white border-black"
                  : "bg-white text-neutral-900 border-neutral-200 hover:bg-neutral-50"
              )}
              title={label}
            >
              {/* Fixed icon box + lucide consistent sizing */}
              <span className="w-8 h-8 flex items-center justify-center flex-none">
                <Icon
                  className={cn("w-5 h-5 flex-none", active ? "text-white" : "text-neutral-900")}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </span>

              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 text-xs text-neutral-500 leading-relaxed">
        <p className="font-medium text-neutral-900">Prototype scope</p>
        <p className="mt-1">
          This is an internal CRUD dashboard + docs vault + in-app reminders. External automations
          (WhatsApp, vet booking integrations, driver routing) are separate projects.
        </p>
      </div>
    </aside>
  );
}
