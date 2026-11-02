"use client";

import { useRef, useState, useTransition } from "react";
import { acceptCandidate, dismissCandidate, ensureSpecies, identifyCandidate, type ActionResult } from "@/app/actions";
import { FormStatus } from "@/components/form-status";
import { CameraIcon } from "@/components/icons";
import { SpeciesImage, SpeciesSelect } from "@/components/species-ui";
import { uploadPhoto } from "@/lib/image";
import type { Box, Candidate, Species } from "@/lib/types";

// Review list for plants the AI spotted on room photos: confirm (optionally correcting name and
// species), take a close-up to identify an uncertain one, or dismiss it.

const CONFIDENCE = {
  high: { label: "sicher erkannt", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" },
  medium: { label: "ziemlich sicher", cls: "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200" },
  low: { label: "unsicher", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200" },
};

/** Widens the AI's box by half its size – its coordinates are approximate, better show some context. */
function pad(b: Box): Box {
  const x = Math.max(0, b.x - b.w * 0.25);
  const y = Math.max(0, b.y - b.h * 0.25);
  return { x, y, w: Math.min(1 - x, b.w * 1.5), h: Math.min(1 - y, b.h * 1.5) };
}

/** Shows the part of a photo inside `box` (fractions), keeping the aspect ratio. */
export function CropThumb({ url, box, className = "" }: { url: string; box: Box | null; className?: string }) {
  const [aspect, setAspect] = useState<number | null>(null);
  const b = box && box.w > 0.02 && box.h > 0.02 ? pad(box) : { x: 0, y: 0, w: 1, h: 1 };
  return (
    <div className={`relative overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800 ${className}`} style={{ aspectRatio: aspect ?? 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="absolute max-w-none"
        style={{ width: `${100 / b.w}%`, left: `${(-b.x / b.w) * 100}%`, top: `${(-b.y / b.h) * 100}%` }}
        onLoad={(e) => {
          const img = e.currentTarget;
          setAspect((b.w * img.naturalWidth) / (b.h * img.naturalHeight));
        }}
      />
    </div>
  );
}

export function CandidateList({ candidates, species }: { candidates: Candidate[]; species: Species[] }) {
  if (candidates.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Erkannte Pflanzen ({candidates.length})</h2>
        <p className="text-sm text-stone-500">
          Auf den Raumfotos gefunden, aber noch nicht angelegt. Prüfe Name und Art und lege sie an – bei unsicheren hilft eine Nahaufnahme.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {candidates.map((c) => (
          <CandidateCard key={`${c.id}-${c.species_id}-${c.confidence}`} candidate={c} species={species} />
        ))}
      </div>
    </section>
  );
}

function CandidateCard({ candidate: c, species }: { candidate: Candidate; species: Species[] }) {
  const initial = species.find((s) => s.id === c.species_id) ?? null;
  const [speciesId, setSpeciesId] = useState(initial?.id ?? null);
  const [name, setName] = useState(initial?.common_name_de ?? "");
  const [manual, setManual] = useState("");
  const [state, setState] = useState<ActionResult | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const picked = species.find((s) => s.id === speciesId) ?? null;
  const unsure = c.confidence === "low" || !c.species_id;

  const run = (label: string, fn: () => Promise<ActionResult>) => {
    setStep(label);
    setState(null);
    start(async () => {
      try {
        setState(await fn());
      } catch (e) {
        setState({ ok: false, error: e instanceof Error ? e.message : "Fehler" });
      } finally {
        setStep(null);
      }
    });
  };

  return (
    <div className={`card space-y-3 p-4 ${unsure ? "border-rose-200 dark:border-rose-900" : ""}`}>
      <div className="flex gap-3">
        <div className="flex w-24 shrink-0 flex-col gap-1.5">
          {c.photo_url && (
            <a href={c.photo_url} target="_blank" rel="noreferrer" title="Ganzes Foto öffnen">
              <CropThumb url={c.photo_url} box={c.box} className="w-24" />
            </a>
          )}
          {c.closeup_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.closeup_url} alt="Nahaufnahme" className="aspect-square w-24 rounded-lg object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE[c.confidence].cls}`}>{CONFIDENCE[c.confidence].label}</span>
          {c.species_guess && <p className="text-stone-500 italic">{c.species_guess}</p>}
          {c.description && <p className="text-xs text-stone-500">{c.description}</p>}
          {picked && (
            <div className="flex items-center gap-2 pt-1">
              <SpeciesImage species={picked} className="size-8 rounded" />
              <span className="text-xs">Vergleich: {picked.common_name_de}</span>
            </div>
          )}
        </div>
      </div>

      {unsure && (
        <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-900 dark:bg-rose-500/10 dark:text-rose-100">
          Die KI ist sich nicht sicher. Mach eine Nahaufnahme der Blätter – oder wähle die Art selbst.
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Monstera am Fenster" />
        </label>
        <label>
          <span className="label">Art</span>
          <SpeciesSelect
            species={species}
            value={speciesId}
            onChange={(s) => {
              setSpeciesId(s?.id ?? null);
              if (s && !name) setName(s.common_name_de);
            }}
          />
        </label>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-stone-500">Art nicht in der Liste?</summary>
        <div className="mt-2 flex gap-2">
          <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Name der Art" />
          <button
            className="btn-ghost"
            disabled={step !== null || manual.trim().length < 2}
            onClick={() =>
              run("KI schreibt Profil…", async () => {
                const r = await ensureSpecies(manual);
                if (!r.ok) return r;
                setSpeciesId(r.species.id);
                if (!name) setName(r.species.common_name_de);
                return { ok: true, message: `${r.species.common_name_de} hinzugefügt` };
              })
            }
          >
            Hinzufügen
          </button>
        </div>
      </details>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          run("Bestimme Art…", async () => {
            const path = await uploadPhoto(file, `candidates/${c.id}`);
            return identifyCandidate(c.id, path);
          });
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          disabled={step !== null || !name.trim()}
          onClick={() => run("Lege an…", () => acceptCandidate({ candidateId: c.id, name, speciesId }))}
        >
          Anlegen
        </button>
        <button className={unsure ? "btn" : "btn-ghost"} disabled={step !== null} onClick={() => input.current?.click()}>
          <CameraIcon className="size-4" /> Nahaufnahme
        </button>
        <button className="btn-danger ml-auto" disabled={step !== null} onClick={() => run("…", () => dismissCandidate(c.id))}>
          Keine Pflanze / ignorieren
        </button>
      </div>
      {step && <p className="animate-pulse text-xs text-stone-500">{step}</p>}
      <FormStatus state={state} />
    </div>
  );
}
