"use client";

import { useState } from "react";

// Two-step button instead of window.confirm(): the in-app browser and some PWAs never show the
// native dialog (confirm() returns false right away), so the question is asked inline.

export function ConfirmButton({
  children,
  question,
  confirmLabel = "Ja, löschen",
  onConfirm,
  className = "btn-danger",
  disabled,
}: {
  children: React.ReactNode;
  question: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className="text-stone-600 dark:text-stone-300">{question}</span>
      <button
        type="button"
        className="min-h-9 rounded-full bg-rose-600 px-3.5 py-1.5 font-medium text-white hover:bg-rose-700"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="min-h-9 rounded-full px-3 py-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={() => setAsking(false)}>
        Abbrechen
      </button>
    </span>
  );
}
