"use client";

import { cn } from "@/lib/utils";

export default function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm border",
            active === t ? "bg-black text-white border-black" : "hover:bg-neutral-50"
          )}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
