"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ensureSpecies, loadSpeciesImages, saveSpecies, type ActionResult } from "@/app/actions";
import { FormStatus, useFormAction } from "@/components/form-status";
import { ChevronIcon, LeafIcon, SparkIcon } from "@/components/icons";
import { normalize } from "@/lib/search";
import { num } from "@/lib/format";
import type { Species } from "@/lib/types";

export function SpeciesImage({ species, className = "" }: { species: Pick<Species, "image_url" | "common_name_de">; className?: string }) {
  return species.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={species.image_url} alt={species.common_name_de} className={`object-cover ${className}`} loading="lazy" />
  ) : (
    <div className={`flex items-center justify-center bg-emerald-50 text-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-800 ${className}`}>
      <LeafIcon className="size-1/3" />
    </div>
  );
}

export function ImageCredit({ species }: { species: Species }) {
  if (!species.image_url) return null;
  return (
    <p className="text-[11px] text-stone-400">
      Foto:{" "}
      <a href={species.image_source_url ?? "#"} target="_blank" rel="noreferrer" className="underline">
        {species.image_author ?? "Wikimedia Commons"}
      </a>
      {species.image_license && `, ${species.image_license}`}
    </p>
  );
}

export function SpeciesBrowser({ species }: { species: Species[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const n = normalize(q);
    if (!n) return species;
    return species.filter((s) => [s.common_name_de, s.scientific_name, ...s.aliases].some((x) => normalize(x).includes(n)));
  }, [q, species]);
  const missingImages = species.filter((s) => !s.image_checked_at).length;

  return (
    <div className="space-y-4">
      {/* one field: search, and when nothing matches, add what was typed as a new species */}
      <input className="input" type="search" placeholder="Art suchen – deutsch oder botanisch" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 && (
        <div className="card space-y-3 p-4">
          <p className="text-sm text-stone-500">„{q}“ ist noch nicht dabei. Die KI schreibt ein Pflegeprofil mit Zielwerten, das du danach anpassen kannst.</p>
          <AddSpecies name={q} />
        </div>
      )}
      {shown.length > 0 && <ul className="card divide-y divide-stone-100 overflow-hidden dark:divide-stone-800">
        {shown.map((s) => (
          <li key={s.id}>
            <Link href={`/species/${s.id}`} className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/40 dark:active:bg-stone-800">
              <SpeciesImage species={s} className="size-12 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{s.common_name_de}</span>
                <span className="block truncate text-xs text-stone-500">
                  <span className="italic">{s.scientific_name}</span> · Feuchte {num(s.moisture_min)}–{num(s.moisture_max)} %{s.winter_rest && " · Winterruhe"}
                </span>
              </span>
              {s.source === "ai" && <span className="shrink-0 rounded bg-violet-100 px-1 text-xs text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">KI</span>}
              <ChevronIcon className="size-4 shrink-0 text-stone-300 dark:text-stone-600" />
            </Link>
          </li>
        ))}
      </ul>}
      {missingImages > 0 && <LoadImages count={missingImages} />}
    </div>
  );
}

function AddSpecies({ name }: { name: string }) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button
        className="btn w-full sm:w-auto"
        disabled={pending || name.trim().length < 2}
        onClick={() =>
          start(async () => {
            const r = await ensureSpecies(name);
            if (!r.ok) return setState(r);
            router.push(`/species/${r.species.id}`);
          })
        }
      >
        <SparkIcon className="size-4" /> {pending ? "KI schreibt Profil…" : `„${name.trim()}“ als neue Art anlegen`}
      </button>
      <FormStatus state={state} />
    </div>
  );
}

function LoadImages({ count }: { count: number }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button className="btn-ghost" disabled={pending} onClick={() => start(async () => setState(await loadSpeciesImages()))}>
        {pending ? "Lade Bilder…" : `Fehlende Bilder laden (${count})`}
      </button>
      <FormStatus state={state} />
    </div>
  );
}

export function SpeciesForm({ species: s }: { species: Species }) {
  const [state, onSubmit, pending] = useFormAction(saveSpecies);
  const field = (name: keyof Species, label: string) => (
    <label>
      <span className="label">{label}</span>
      <input className="input" name={name} inputMode="decimal" defaultValue={(s[name] as number | null) ?? ""} />
    </label>
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="id" value={s.id} />
      <label className="block">
        <span className="label">Deutscher Name</span>
        <input className="input" name="common_name_de" defaultValue={s.common_name_de} />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field("moisture_min", "Feuchte min %")}
        {field("moisture_max", "Feuchte max %")}
        {field("light_min_lux", "Licht min lx")}
        {field("light_max_lux", "Licht max lx")}
        {field("temp_min_c", "Temp. min °C")}
        {field("temp_max_c", "Temp. max °C")}
        {field("humidity_min", "Luftfeuchte min %")}
        {field("humidity_max", "Luftfeuchte max %")}
        {field("conductivity_min", "Dünger min µS")}
        {field("conductivity_max", "Dünger max µS")}
        {field("fertilize_every_days", "Düngen alle … Tage")}
        {field("winter_moisture_min", "Winter: Feuchte min %")}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="winter_rest" defaultChecked={s.winter_rest} className="accent-emerald-600" /> Winterruhe (weniger gießen, nicht düngen)
      </label>
      <label className="block">
        <span className="label">Pflegetipps</span>
        <textarea className="input" name="care_notes" rows={3} defaultValue={s.care_notes ?? ""} />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>Speichern</button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

/** Species dropdown with search-as-you-type over all names; `onPick` gets the chosen species. */
export function SpeciesSelect({
  species,
  value,
  onChange,
  name,
}: {
  species: Species[];
  value: string | null;
  onChange: (s: Species | null) => void;
  name?: string;
}) {
  return (
    <select
      className="input"
      name={name}
      value={value ?? ""}
      onChange={(e) => onChange(species.find((s) => s.id === e.target.value) ?? null)}
    >
      <option value="">– Art wählen –</option>
      {species.map((s) => (
        <option key={s.id} value={s.id}>
          {s.common_name_de} ({s.scientific_name})
        </option>
      ))}
    </select>
  );
}
