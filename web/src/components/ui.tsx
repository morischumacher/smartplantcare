import { STATUS, num } from "@/lib/format";
import type { Status } from "@/lib/types";

export function StatusPill({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.pill}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/** Moisture as a bar on a 0–100 % scale with the target band shaded. */
export function MoistureBar({ value, min, max, status }: { value: number | null; min: number; max: number; status: Status }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
      <div
        className="absolute inset-y-0 bg-emerald-500/15 dark:bg-emerald-400/15"
        style={{ left: `${min}%`, width: `${max - min}%` }}
      />
      {value !== null && (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${STATUS[status].dot}`}
          style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
        />
      )}
      <span className="sr-only">Feuchte {num(value)} %, Ziel {min}–{max} %</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-stone-200/70 dark:bg-stone-800/70 ${className}`} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700">{children}</div>;
}
