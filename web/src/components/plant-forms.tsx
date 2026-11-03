"use client";

import { ConfirmButton } from "@/components/confirm-button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deletePlant, ensureSpecies, identifyPhoto, repot, savePlant } from "@/app/actions";
import { FormStatus, useFormAction } from "@/components/form-status";
import { SpeciesImage, SpeciesSelect } from "@/components/species-ui";
import { SOIL_TYPES } from "@/lib/format";
import { uploadPhoto } from "@/lib/image";
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
  const [state, onSubmit, pending] = useFormAction(savePlant);
  const form = useRef<HTMLFormElement>(null);
  const [speciesId, setSpeciesId] = useState(plant?.species_id ?? null);
  // a species the AI just created is not in the list until the page refreshes
  const [found, setFound] = useState<Species | null>(null);
  const list = found && !species.some((s) => s.id === found.id) ? [found, ...species] : species;
  const picked = list.find((s) => s.id === speciesId) ?? null;
  // editing an existing plant: species targets are offered, not applied silently over its own values
  const [offer, setOffer] = useState<Species | null>(null);
  const choose = (sp: Species) => (plant ? setOffer(sp) : apply(sp));

  function apply(sp: Species) {
    const el = form.current!.elements as unknown as Record<string, HTMLInputElement | HTMLSelectElement | undefined>;
    for (const f of TARGET_FIELDS) if (el[f]) el[f]!.value = sp[f] === null ? "" : String(sp[f]);
    if (el.species) el.species.value = sp.common_name_de;
    if (el.soil_type) el.soil_type.value = sp.soil_type;
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-5">
      {plant && <input type="hidden" name="id" value={plant.id} />}
      <div className="flex gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-800/40">
        {picked && <SpeciesImage species={picked} className="size-16 shrink-0 rounded-lg" />}
        <div className="flex-1 space-y-1.5">
          <span className="label">Pflanzenart</span>
          <SpeciesSelect
            species={list}
            name="species_id"
            value={speciesId}
            onChange={(sp) => {
              setSpeciesId(sp?.id ?? null);
              setOffer(null);
              if (sp) choose(sp);
            }}
          />
          <FromPhoto
            onFound={(sp, name) => {
              const el = form.current!.elements as unknown as Record<string, HTMLInputElement | undefined>;
              if (el.name && !el.name.value) el.name.value = name;
              if (!sp) {
                if (el.species && !el.species.value) el.species.value = name;
                return;
              }
              setFound(sp);
              setSpeciesId(sp.id);
              choose(sp);
            }}
          />
          {offer && (
            <button
              type="button"
              className="btn-ghost w-full text-xs"
              onClick={() => {
                apply(offer);
                setOffer(null);
              }}
            >
              Zielwerte von „{offer.common_name_de}“ übernehmen
            </button>
          )}
          <p className="text-xs text-stone-500">
            Übernimmt Feuchte, Licht und Temperatur als Startwerte. Art fehlt? Per Foto erkennen lassen oder unter <Link className="underline" href="/species">Arten</Link> anlegen.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className="input" name="name" defaultValue={plant?.name} required placeholder="z. B. Monstera Wohnzimmer" /></Field>
        <Field label="Sorte oder botanischer Name (optional)"><input className="input" name="species" defaultValue={plant?.species ?? ""} placeholder="z. B. Monstera deliciosa" /></Field>
        <Field label="Raum">
          <select className="input" name="room_id" defaultValue={plant?.room_id ?? ""}>
            <option value="">– kein Raum –</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {rooms.length === 0 && (
            <span className="mt-1 block text-xs text-stone-500">
              Noch kein Raum – unter <Link className="underline" href="/settings">Einstellungen</Link> anlegen, dann teilen sich die Pflanzen das Raumklima.
            </span>
          )}
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
        <summary className="cursor-pointer py-1 text-stone-500">Weitere Einstellungen: Licht, Temperatur, Foto-Erinnerung</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Licht min (lx)"><input className="input" name="light_min_lux" inputMode="numeric" defaultValue={plant?.light_min_lux ?? ""} /></Field>
          <Field label="Licht max (lx)"><input className="input" name="light_max_lux" inputMode="numeric" defaultValue={plant?.light_max_lux ?? ""} /></Field>
          <Field label="Temp. min (°C)"><input className="input" name="temp_min_c" inputMode="decimal" defaultValue={plant?.temp_min_c ?? ""} /></Field>
          <Field label="Temp. max (°C)"><input className="input" name="temp_max_c" inputMode="decimal" defaultValue={plant?.temp_max_c ?? ""} /></Field>
          <div className="col-span-2">
            <Field label="Ans Foto erinnern alle … Tage">
              <input className="input" name="photo_interval_days" type="number" min="1" inputMode="numeric" defaultValue={plant?.photo_interval_days ?? 14} />
            </Field>
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-500">Wird beim Wählen der Pflanzenart vorausgefüllt. Aus der Temperatur entsteht die Warnung „zu kalt“ oder „zu warm“ für den Raum.</p>
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
              <label key={s.id} className="flex min-h-10 items-center gap-2.5 text-sm">
                <input type="checkbox" name="sensor_ids" value={s.id} defaultChecked={plant?.sensor_ids.includes(s.id)} className="size-5 accent-emerald-600" />
                <span>
                  {s.name}
                  {s.taken_by && <span className="block text-xs text-stone-400">steckt gerade in „{s.taken_by}“ – wird umgezogen</span>}
                </span>
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
  const [state, onSubmit, pending] = useFormAction(repot);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
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

export function DeletePlantButton({ plantId, name }: { plantId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ConfirmButton
        className="btn-danger border border-rose-200 dark:border-rose-900"
        disabled={pending}
        question={`„${name}“ endgültig löschen?`}
        onConfirm={() =>
          start(async () => {
            const res = await deletePlant(plantId);
            if (res.ok) router.push("/");
            else setError(res.error);
          })
        }
      >
        {pending ? "Lösche…" : "Pflanze löschen"}
      </ConfirmButton>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </>
  );
}

/** Photo → species via Claude. The photo is kept and becomes the plant's first diary photo. */
function FromPhoto({ onFound }: { onFound: (sp: Species | null, name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // recognised, but not in the species list yet: offer to create it right here
  const [missing, setMissing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    setNote(null);
    setMissing(null);
    start(async () => {
      try {
        const p = await uploadPhoto(file, "identify");
        setPath(p);
        const r = await identifyPhoto(p);
        if (!r.ok) return setNote({ ok: false, text: r.error });
        if (!r.name) return setNote({ ok: false, text: `Keine Pflanze erkannt. ${r.reasoning}` });
        onFound(r.species, r.name);
        const sure = { high: "sicher", medium: "ziemlich sicher", low: "unsicher" }[r.confidence];
        setNote({ ok: true, text: `${r.name} (${sure}): ${r.reasoning}` });
        if (!r.species) setMissing(r.name);
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : "Upload fehlgeschlagen" });
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-1">
      {path && <input type="hidden" name="photo_path" value={path} />}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="btn-ghost w-full" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? "Erkenne Art…" : path ? "Anderes Bild" : "Von Bild erkennen"}
      </button>
      {note && <p className={`text-xs ${note.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{note.text}</p>}
      {missing && (
        <button
          type="button"
          className="btn w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await ensureSpecies(missing);
              if (!r.ok) return setNote({ ok: false, text: r.error });
              setMissing(null);
              onFound(r.species, missing);
            })
          }
        >
          {pending ? "Lege Art an…" : `„${missing}“ als neue Art anlegen`}
        </button>
      )}
      {missing && !pending && <p className="text-xs text-stone-500">Noch nicht in der Artenliste. Die KI ergänzt Pflegewerte, das dauert ein paar Sekunden.</p>}
    </div>
  );
}
