'use client';

// Minimal right-side fly-in sheet for admin drill-ins.
// Self-contained — no shadcn/radix dependency. Matches the project's dark Tailwind style.

import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  widthClass?: string;
}

export function AdminSheet({ open, onClose, title, subtitle, children, widthClass = 'max-w-xl' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute inset-y-0 right-0 w-full ${widthClass} bg-neutral-950 border-l border-neutral-800 shadow-2xl transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
      >
        <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {subtitle && <p className="text-xs text-neutral-500 mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
