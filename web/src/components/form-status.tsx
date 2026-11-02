"use client";

import type { ActionResult } from "@/app/actions";

export function FormStatus({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok) return <p className="text-sm text-rose-600">{state.error}</p>;
  return state.message ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null;
}
