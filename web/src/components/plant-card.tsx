import Link from "next/link";
import { DropIcon, SunIcon, ThermoIcon } from "@/components/icons";
import { MoistureBar, StatusPill } from "@/components/ui";
import { lightCategory, num } from "@/lib/format";
import { plantTodos } from "@/lib/todos";
import type { PlantSummary } from "@/lib/types";

export function PlantCard({ plant }: { plant: PlantSummary }) {
  const todos = plantTodos(plant).filter((t) => t.level !== "info").slice(0, 2);
  const light = lightCategory(plant.light_peak_7d);
  return (
    <Link
      href={`/plants/${plant.id}`}
      className="card group block p-4 transition hover:border-stone-300 active:scale-[0.99] dark:hover:border-stone-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{plant.name}</h3>
          {plant.species && <p className="truncate text-xs text-stone-500 italic">{plant.species}</p>}
        </div>
        <StatusPill status={plant.status} />
      </div>
      <div className="mt-3 mb-2 flex items-end justify-between gap-3">
        <p className="font-display text-3xl leading-none tabular-nums">
          {num(plant.moisture)}<span className="ml-0.5 text-base text-stone-400"> %</span>
        </p>
        <div className="flex gap-3 pb-0.5 text-xs text-stone-500">
          {plant.temperature != null && (
            <span className="flex items-center gap-1"><ThermoIcon className="size-3.5" />{num(plant.temperature, 1)} °C</span>
          )}
          {(light || plant.light != null) && (
            <span className="flex items-center gap-1"><SunIcon className="size-3.5" />{light ? light.label : `${num(plant.light)} lx`}</span>
          )}
        </div>
      </div>
      <MoistureBar value={plant.moisture} min={plant.target.min} max={plant.target.max} status={plant.status} />
      <p className="mt-1 flex items-center gap-1 text-[11px] text-stone-400"><DropIcon className="size-3" /> Bodenfeuchte · Ziel {plant.target.min}–{plant.target.max} %</p>
      {todos.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-xs dark:border-stone-800">
          {todos.map((t) => (
            <li key={t.text} className={t.level === "urgent" ? "font-medium text-rose-600 dark:text-rose-400" : t.level === "done" ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-stone-600 dark:text-stone-300"}>
              {t.text}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
