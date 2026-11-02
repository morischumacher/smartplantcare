"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { useState, useTransition } from "react";
import { deleteWatering, logWatering, type ActionResult } from "@/app/actions";
import { FormStatus } from "@/components/form-status";
import { dateTime, num } from "@/lib/format";

export function WateringForm({ plantId, recommended }: { plantId: string; recommended: number | null }) {
  const [amount, setAmount] = useState(String(recommended ?? 250));
  const [when, setWhen] = useState("");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await logWatering({ plantId, amountMl: Number(amount), ts: when ? new Date(when).toISOString() : undefined });
          setState(r);
          if (r.ok) setWhen("");
        });
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className="input pr-10 tabular-nums"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            aria-label="Menge in ml"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-400">ml</span>
        </div>
        <button className="btn" disabled={pending || !amount}>{pending ? "…" : "Gegossen"}</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[100, 200, 300, 500].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(String(v))}
            className={`rounded-full px-3 py-1.5 text-sm transition sm:py-1 sm:text-xs ${amount === String(v) ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950" : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"}`}
          >
            {v} ml
          </button>
        ))}
      </div>
      <details className="text-xs text-stone-500">
        <summary className="cursor-pointer">Anderer Zeitpunkt</summary>
        <input type="datetime-local" className="input mt-2" value={when} onChange={(e) => setWhen(e.target.value)} />
      </details>
      <FormStatus state={state} />
    </form>
  );
}

/** Waterings the sensor detected but nobody logged; confirming them with an amount feeds the learning. */
export function PendingWaterings({
  plantId,
  pending,
  mlPerPoint,
}: {
  plantId: string;
  pending: { ts: string; before: number; peak: number }[];
  mlPerPoint: number | null;
}) {
  return (
    <ul className="space-y-2">
      {pending.map((p) => (
        <PendingItem key={p.ts} plantId={plantId} item={p} estimate={mlPerPoint ? Math.round(((p.peak - p.before) * mlPerPoint) / 10) * 10 : null} />
      ))}
    </ul>
  );
}

function PendingItem({ plantId, item, estimate }: { plantId: string; item: { ts: string; before: number; peak: number }; estimate: number | null }) {
  const [amount, setAmount] = useState(estimate ? String(estimate) : "");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-950/40">
      <p className="mb-2">
        <span className="font-medium">{dateTime(item.ts)}</span>: Feuchte stieg von {num(item.before)} auf {num(item.peak)} %. Wie viel war es?
      </p>
      <div className="flex gap-2">
        <input className="input tabular-nums" inputMode="numeric" placeholder="ml" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} />
        <button
          className="btn"
          disabled={pending || !amount}
          onClick={() =>
            start(async () => setState(await logWatering({ plantId, amountMl: Number(amount), ts: item.ts, source: "detected" })))
          }
        >
          Bestätigen
        </button>
      </div>
      <FormStatus state={state} />
    </li>
  );
}

export function WateringHistory({ items }: { items: { id: string; ts: string; amount_ml: number; source: string; during_vacation: boolean }[] }) {
  const [pending, start] = useTransition();
  if (items.length === 0) return <p className="text-sm text-stone-500">Noch nichts eingetragen.</p>;
  return (
    <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
      {items.map((w) => (
        <li key={w.id} className="flex items-center gap-3 py-2">
          <span className="w-28 text-stone-500 tabular-nums">{dateTime(w.ts)}</span>
          <span className="font-medium tabular-nums">{num(w.amount_ml)} ml</span>
          {w.source === "detected" && <span className="rounded-full bg-sky-100 px-2 text-xs text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">erkannt</span>}
          {w.during_vacation && <span className="rounded-full bg-stone-100 px-2 text-xs dark:bg-stone-800">Urlaub</span>}
          <span className="ml-auto">
            <ConfirmButton
              className="text-xs text-stone-400 hover:text-rose-600"
              disabled={pending}
              question="Eintrag löschen?"
              onConfirm={() => start(async () => void (await deleteWatering(w.id)))}
            >
              Löschen
            </ConfirmButton>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One tap from the overview: log the recommended amount now. */
export function QuickWater({ plantId, ml }: { plantId: string; ml: number }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">✓ eingetragen</span>;
  return (
    <button
      type="button"
      className="btn shrink-0 px-3"
      disabled={pending}
      title={error ?? undefined}
      onClick={() =>
        start(async () => {
          const r = await logWatering({ plantId, amountMl: ml });
          if (r.ok) setDone(true);
          else setError(r.error);
        })
      }
    >
      {pending ? "…" : error ? "Nochmal" : `${num(ml)} ml gegossen`}
    </button>
  );
}
