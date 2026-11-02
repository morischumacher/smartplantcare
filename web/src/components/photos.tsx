"use client";

import { useRef, useState, useTransition } from "react";
import { deletePhoto, reanalyzePhoto, registerPhoto, type ActionResult } from "@/app/actions";
import { FormStatus } from "@/components/form-status";
import { CameraIcon } from "@/components/icons";
import type { Photo } from "@/lib/data";
import { PHOTO_REASONS, date } from "@/lib/format";
import { uploadPhoto } from "@/lib/image";

const HEALTH = {
  good: { label: "Gesund", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" },
  fair: { label: "Geht so", cls: "bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200" },
  poor: { label: "Schlecht", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200" },
};

export function PhotoUpload({ plantId, reason }: { plantId: string; reason: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ActionResult | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [, start] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setState(null);
    start(async () => {
      try {
        setStep("Lade hoch…");
        const path = await uploadPhoto(file, plantId);
        setStep("KI schaut sich das Foto an…");
        setState(await registerPhoto({ plantId, path, reason }));
      } catch (e) {
        setState({ ok: false, error: e instanceof Error ? e.message : "Upload fehlgeschlagen" });
      } finally {
        setStep(null);
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <button className="btn" onClick={() => input.current?.click()} disabled={step !== null}>
        <CameraIcon className="size-4" />
        {step ?? "Foto hinzufügen"}
      </button>
      <FormStatus state={state} />
    </div>
  );
}

export function PhotoTimeline({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<string | null>(photos[0]?.id ?? null);
  const [pending, start] = useTransition();
  if (photos.length === 0) return <p className="text-sm text-stone-500">Noch keine Fotos. Das erste Foto ist der Ausgangspunkt für spätere Vergleiche.</p>;
  const current = photos.find((p) => p.id === open) ?? photos[0];
  const a = current.analysis;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        {current.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt="" className="aspect-[4/5] w-full rounded-xl object-cover" />
        )}
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpen(p.id)}
              className={`relative shrink-0 overflow-hidden rounded-lg ring-2 ${p.id === current.id ? "ring-emerald-500" : "ring-transparent"}`}
            >
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="size-14 object-cover" />
              )}
              {p.analysis && <span className={`absolute right-1 bottom-1 size-2 rounded-full ring-1 ring-white ${p.analysis.health === "good" ? "bg-emerald-500" : p.analysis.health === "fair" ? "bg-amber-400" : "bg-rose-500"}`} />}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{date(current.taken_at)}</span>
          {current.reason && <span className="text-xs text-stone-500">{PHOTO_REASONS[current.reason] ?? current.reason}</span>}
          {a && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${HEALTH[a.health].cls}`}>{HEALTH[a.health].label}</span>}
        </div>
        {a ? (
          <>
            <p>{a.summary}</p>
            {a.issues.length > 0 && (
              <ul className="space-y-1">
                {a.issues.map((i) => (
                  <li key={i.description} className="flex gap-2">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${i.severity === "high" ? "bg-rose-500" : i.severity === "medium" ? "bg-amber-400" : "bg-stone-400"}`} />
                    {i.description}
                  </li>
                ))}
              </ul>
            )}
            <dl className="space-y-2 rounded-xl bg-stone-50 p-3 text-xs dark:bg-stone-800/50">
              <div><dt className="font-medium">Gießen</dt><dd className="text-stone-600 dark:text-stone-300">{a.watering_assessment}</dd></div>
              <div><dt className="font-medium">Licht</dt><dd className="text-stone-600 dark:text-stone-300">{a.light_assessment}</dd></div>
              <div><dt className="font-medium">Seit dem letzten Foto</dt><dd className="text-stone-600 dark:text-stone-300">{a.growth_vs_previous}</dd></div>
            </dl>
            {a.recommendations.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium">Empfehlungen</p>
                <ul className="list-disc space-y-0.5 pl-4">{a.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-stone-500">Noch nicht ausgewertet.</p>
        )}
        <div className="flex gap-2 pt-1">
          <button className="btn-ghost" disabled={pending} onClick={() => start(async () => void (await reanalyzePhoto(current.id)))}>
            {pending ? "…" : a ? "Neu auswerten" : "Auswerten"}
          </button>
          <button className="btn-danger" disabled={pending} onClick={() => confirm("Foto löschen?") && start(async () => void (await deletePhoto(current.id)))}>
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}
