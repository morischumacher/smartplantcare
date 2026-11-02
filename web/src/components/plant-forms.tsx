"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { repot, savePlant } from "@/app/actions";
import { FormStatus } from "@/components/form-status";
import { SpeciesImage, SpeciesSelect } from "@/components/species-ui";
import { SOIL_TYPES } from "@/lib/format";
import type { Species } from "@/lib/types";

type Plant = {
  id: string;
  name: string;
  species: string | null;
  room_id: string | null;
  moisture_min: number;
  moisture_max: number;
  light_min_lux: number | null;
  light_max_lux: number | null;
  temp_min_c: number | null;
  temp_max_c: number | null;
  photo_interval_days: number;
  notes: string | null;
  species_id: string | null;
  sensor_ids: string[];
};

/** Species values that become the plant's targets. */
const TARGET_FIELDS = ["moisture_min", "moisture_max", "light_min_lux", "light_max_lux", "temp_min_c", "temp_max_c"] as const;

type Option = { id: string; name: string };

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function PotFields() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label="Volumen (l)"><input className="input" name="volume_l" inputMode="decimal" placeholder="z. B. 3" /></Field>
      <Field label="Durchmesser (cm)"><input className="input" name="diameter_cm" inputMode="decimal" /></Field>
      <Field label="Höhe (cm)"><input className="input" name="height_cm" inputMode="decimal" /></Field>
      <Field label="Erde">
        <select className="input" name="soil_type" defaultValue="universal">
          {Object.entries(SOIL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
    </div>
  );
}

export function PlantForm({
  plant,
  rooms,
  sensors,
  species,
}: {
  plant?: Plant;
  rooms: Option[];
  sensors: (Option & { taken_by: string | null })[];
  species: Species[];
}) {
  const [state, action, pending] = useActionState(savePlant, null);
  const form = useRef<HTMLFormElement>(null);
  const [speciesId, setSpeciesId] = useState(plant?.species_id ?? null);
  const picked = species.find((s) => s.id === speciesId) ?? null;

  function apply(sp: Species) {
    const el = form.current!.elements as unknown as Record<string, HTMLInputElement | HTMLSelectElement | undefined>;
    for (const f of TARGET_FIELDS) if (el[f]) el[f]!.value = sp[f] === null ? "" : String(sp[f]);
    if (el.species) el.species.value = sp.common_name_de;
    if (el.soil_type) el.soil_type.value = sp.soil_type;
  }

  return (
    <form ref={form} action={action} className="space-y-5">
      {plant && <input type="hidden" name="id" value={plant.id} />}
      <div className="flex gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/40">
        {picked && <SpeciesImage species={picked} className="size-16 shrink-0 rounded-lg" />}
        <div className="flex-1 space-y-1.5">
          <span className="label">Pflanzenart</span>
          <SpeciesSelect
            species={species}
            name="species_id"
            value={speciesId}
            onChange={(sp) => {
              setSpeciesId(sp?.id ?? null);
              if (sp && (!plant || confirm(`Zielwerte von „${sp.common_name_de}“ übernehmen?`))) apply(sp);
            }}
          />
          <p className="text-xs text-stone-500">
            Übernimmt Feuchte, Licht und Temperatur als Startwerte. Art fehlt? Unter <Link className="underline" href="/species">Arten</Link> von der KI anlegen lassen.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="input" name="name" defaultValue={plant?.name} required placeholder="z. B. Monstera Wohnzimmer" /></Field>
        <Field label="Bezeichnung (frei)"><input className="input" name="species" defaultValue={plant?.species ?? ""} placeholder="z. B. Monstera deliciosa" /></Field>
        <Field label="Raum">
          <select className="input" name="room_id" defaultValue={plant?.room_id ?? ""}>
            <option value="">– kein Raum –</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Foto-Erinnerung alle … Tage">
          <input className="input" name="photo_interval_days" type="number" min="1" defaultValue={plant?.photo_interval_days ?? 14} />
        </Field>
      </div>

      <fieldset>
        <legend className="label">Bodenfeuchte-Ziel (%)</legend>
        <div className="flex items-center gap-2">
          <input className="input" name="moisture_min" type="number" min="0" max="100" defaultValue={plant?.moisture_min ?? 20} aria-label="Minimum" />
          <span className="text-stone-400">bis</span>
          <input className="input" name="moisture_max" type="number" min="0" max="100" defaultValue={plant?.moisture_max ?? 50} aria-label="Maximum" />
        </div>
        <p className="mt-1 text-xs text-stone-500">Unter dem Minimum wird gegossen, bis zum Maximum aufgefüllt.</p>
      </fieldset>

      <details className="text-sm">
        <summary className="cursor-pointer text-stone-500">Licht und Temperatur (optional)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Licht min (lx)"><input className="input" name="light_min_lux" inputMode="numeric" defaultValue={plant?.light_min_lux ?? ""} /></Field>
          <Field label="Licht max (lx)"><input className="input" name="light_max_lux" inputMode="numeric" defaultValue={plant?.light_max_lux ?? ""} /></Field>
          <Field label="Temp. min (°C)"><input className="input" name="temp_min_c" inputMode="decimal" defaultValue={plant?.temp_min_c ?? ""} /></Field>
          <Field label="Temp. max (°C)"><input className="input" name="temp_max_c" inputMode="decimal" defaultValue={plant?.temp_max_c ?? ""} /></Field>
        </div>
      </details>

      {!plant && (
        <fieldset>
          <legend className="label">Topf</legend>
          <PotFields />
          <p className="mt-1 text-xs text-stone-500">Aus der Topfgröße schätzt die App die erste Gießmenge, bis sie es gelernt hat.</p>
        </fieldset>
      )}

      <fieldset>
        <legend className="label">Sensoren</legend>
        {sensors.length === 0 ? (
          <p className="text-sm text-stone-500">Noch keine Sensoren erkannt – sie erscheinen automatisch, sobald das Gateway sie sieht.</p>
        ) : (
          <div className="space-y-1.5">
            {sensors.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sensor_ids" value={s.id} defaultChecked={plant?.sensor_ids.includes(s.id)} className="accent-emerald-600" />
                {s.name}
                {s.taken_by && <span className="text-xs text-stone-400">(gehört zu {s.taken_by})</span>}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Field label="Notizen"><textarea className="input" name="notes" rows={2} defaultValue={plant?.notes ?? ""} /></Field>

      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Speichern…" : plant ? "Speichern" : "Pflanze anlegen"}</button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function RepotForm({ plantId }: { plantId: string }) {
  const [state, action, pending] = useActionState(repot, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="plant_id" value={plantId} />
      <PotFields />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Umgetopft am"><input className="input" type="date" name="started_at" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="Notiz"><input className="input" name="notes" placeholder="z. B. Wurzeln gekürzt" /></Field>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>Umtopfen speichern</button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
