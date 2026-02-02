"use client";

import { useEffect } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        {/* 
          Key changes:
          - max-h uses viewport so modal never exceeds screen height
          - overflow-hidden on container
          - header is "sticky" so Close stays visible
          - body scrolls with overflow-y-auto
        */}
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border overflow-hidden max-h-[calc(100vh-2rem)]">
          <div className="flex items-start justify-between gap-3 p-4 sticky top-0 bg-white border-b">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button className="text-sm underline" onClick={onClose} type="button">
              Close
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[calc(100vh-2rem-64px)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
