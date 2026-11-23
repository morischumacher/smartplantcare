import Link from "next/link";
import { ChevronIcon } from "@/components/icons";
import { STATUS, lightCategory, num } from "@/lib/format";
import { plantTodos } from "@/lib/todos";
import type { PlantSummary } from "@/lib/types";
import { NAV_FORWARD } from "@/components/page-transition";

// One plant as a list row (like iOS Settings): moisture badge, name, the most important thing to do.
// Rows are short so a whole room fits on one phone screen.

const ORDER = { water_now: 0, water_soon: 1, ok: 2, no_data: 3 };

/** Plants that need something first, plants without readings last. */
export function byUrgency(plants: PlantSummary[]): PlantSummary[] {
  return [...plants].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, "de"));
}

export function PlantRow({ plant }: { plant: PlantSummary }) {
  const todo = plantTodos(plant).find((t) => t.level !== "info");
  const light = lightCategory(plant.light_peak_7d);
  const s = STATUS[plant.status];
  const values = [light?.label, plant.temperature != null && `${num(plant.temperature, 1)} °C`];
  // "✓ Gerade gegossen" is good news, not a task: keep the values after it
  const detail = (
    todo?.level === "done"
      ? [todo.text, ...values]
      : todo
        ? [todo.text]
        : [plant.moisture != null && "Feuchte ok", ...values]
  )
    .filter(Boolean)
    .join(" · ");
  const species = plant.species && plant.species !== plant.name ? plant.species : null;

  return (
    <Link href={`/plants/${plant.id}`} transitionTypes={NAV_FORWARD} className="row group flex items-center gap-3 px-4 py-3 hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/40 dark:active:bg-stone-800">
      <span
        className="flex size-12 shrink-0 flex-col items-center justify-center rounded-full border-[3px] tabular-nums"
        style={{ borderColor: s.fill }}
        aria-label={`Bodenfeuchte ${num(plant.moisture)} %, ${s.label}`}
      >
        <span className="text-sm leading-none font-semibold">{plant.moisture == null ? "–" : num(plant.moisture)}</span>
        <span className="text-[9px] leading-none text-stone-500">%</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{plant.name}</span>
          {species && <span className="truncate text-xs text-stone-400 italic">{species}</span>}
        </span>
        <span
          className={`block truncate text-sm ${
            todo?.level === "urgent"
              ? "font-medium text-rose-600 dark:text-rose-400"
              : todo?.level === "done"
                ? "font-medium text-emerald-700 dark:text-emerald-400"
                : todo
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-stone-500"
          }`}
        >
          {detail || s.label}
        </span>
      </span>
      <ChevronIcon className="size-4 shrink-0 text-stone-300 dark:text-stone-600" />
    </Link>
  );
}

export function PlantList({ plants, onHover }: { plants: PlantSummary[]; onHover?: (id: string | null) => void }) {
  return (
    <ul className="card divide-y divide-stone-100 overflow-hidden dark:divide-stone-800">
      {byUrgency(plants).map((p) => (
        <li
          key={p.id}
          onMouseEnter={onHover && (() => onHover(p.id))}
          onMouseLeave={onHover && (() => onHover(null))}
          onFocus={onHover && (() => onHover(p.id))}
          onBlur={onHover && (() => onHover(null))}
        >
          <PlantRow plant={p} />
        </li>
      ))}
    </ul>
  );
}
