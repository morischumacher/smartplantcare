"use client";

import { useSyncExternalStore } from "react";

// On an iPhone in Safari (not yet added to the home screen): how to install the app. Dismissible;
// the choice is remembered in this browser only.

const KEY = "install-hint-dismissed";
const listeners = new Set<() => void>();

function visible(): boolean {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return ios && !standalone && localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function InstallHint() {
  const show = useSyncExternalStore(subscribe, visible, () => false);
  if (!show) return null;
  return (
    <div className="card flex items-start gap-3 border-emerald-200 bg-emerald-50/70 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
      <ShareIcon className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
      <p className="flex-1 text-emerald-950 dark:text-emerald-100">
        <span className="font-medium">Als App aufs iPhone:</span> unten auf <span className="font-medium">Teilen</span> tippen, dann{" "}
        <span className="font-medium">„Zum Home-Bildschirm“</span>. Dann öffnet sie sich im Vollbild.
      </p>
      <button
        type="button"
        aria-label="Hinweis ausblenden"
        className="-m-1 rounded-full p-1 text-stone-500 hover:bg-emerald-100 dark:hover:bg-emerald-900"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
          listeners.forEach((l) => l());
        }}
      >
        ✕
      </button>
    </div>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5v10h14V11h-1" />
    </svg>
  );
}
