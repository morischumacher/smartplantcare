"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { useState, useSyncExternalStore, useTransition } from "react";
import { addVacation, deleteRoom, saveWateringDays, deleteSensor, deleteVacation, ignoreSensor, restorePlant, unignoreSensor, saveNotifySettings, saveRoom, saveSensor, sendTestPush, type ActionResult } from "@/app/actions";
import { FormStatus, useFormAction } from "@/components/form-status";

type Option = { id: string; name: string };

export function RoomForm({
  room,
  hygrometers,
  hygrometerId,
}: {
  room?: { id: string; name: string; humidity_min: number; humidity_max: number };
  hygrometers: Option[];
  hygrometerId?: string | null;
}) {
  const [state, onSubmit, pending] = useFormAction(saveRoom);
  const [deleting, start] = useTransition();
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
      {room && <input type="hidden" name="id" value={room.id} />}
      <label className="col-span-2 sm:col-span-1">
        <span className="label">Name</span>
        <input className="input" name="name" defaultValue={room?.name} required placeholder="z. B. Wohnzimmer" />
      </label>
      <label>
        <span className="label">Luftfeuchte min %</span>
        <input className="input" name="humidity_min" type="number" inputMode="numeric" defaultValue={room?.humidity_min ?? 40} />
      </label>
      <label>
        <span className="label">max %</span>
        <input className="input" name="humidity_max" type="number" inputMode="numeric" defaultValue={room?.humidity_max ?? 60} />
      </label>
      <label className="col-span-2 sm:col-span-1">
        <span className="label">Hygrometer</span>
        <select className="input" name="hygrometer_id" defaultValue={hygrometerId ?? ""}>
          <option value="">– keins –</option>
          {hygrometers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <div className="col-span-2 flex gap-1 sm:col-span-1">
        <button className="btn" disabled={pending}>{room ? "Speichern" : "Anlegen"}</button>
        {room && (
          <ConfirmButton
            disabled={deleting}
            question={`Raum „${room.name}“ löschen? Pflanzen bleiben erhalten.`}
            onConfirm={() => start(async () => void (await deleteRoom(room.id)))}
          >
            Löschen
          </ConfirmButton>
        )}
      </div>
      <div className="col-span-2 sm:col-span-5"><FormStatus state={state} /></div>
    </form>
  );
}

export function SensorForm({ sensor, rooms }: { sensor: { id: string; name: string | null; mac: string; type: string; room_id: string | null }; rooms: Option[] }) {
  const [state, onSubmit, pending] = useFormAction(saveSensor);
  const [deleting, start] = useTransition();
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={sensor.id} />
      <label className="min-w-40 flex-1">
        <span className="label">Name</span>
        <input className="input" name="name" defaultValue={sensor.name ?? ""} placeholder={sensor.mac} />
      </label>
      {sensor.type === "hygrometer" && (
        <label className="min-w-40 flex-1">
          <span className="label">Raum</span>
          <select className="input" name="room_id" defaultValue={sensor.room_id ?? ""}>
            <option value="">–</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}
      {sensor.type !== "hygrometer" && <input type="hidden" name="room_id" value={sensor.room_id ?? ""} />}
      <button className="btn-ghost" disabled={pending}>Speichern</button>
      <ConfirmButton
        disabled={deleting}
        question="Nicht dein Sensor? Er verschwindet aus der Liste, seine Werte werden nicht mehr gespeichert. Zurückholen geht unter „Ignoriert“."
        confirmLabel="Ja, ignorieren"
        className="btn-ghost"
        onConfirm={() => start(async () => void (await ignoreSensor(sensor.id)))}
      >
        Ignorieren
      </ConfirmButton>
      <ConfirmButton
        disabled={deleting}
        question="Sensor samt allen Messwerten löschen? Empfängt das Gateway ihn wieder, taucht er neu auf."
        onConfirm={() => start(async () => void (await deleteSensor(sensor.id)))}
      >
        Löschen
      </ConfirmButton>
      <FormStatus state={state} />
    </form>
  );
}

export function VacationForm() {
  const [state, onSubmit, pending] = useFormAction(addVacation);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <label><span className="label">Von</span><input className="input" type="date" name="starts_on" required /></label>
      <label><span className="label">Bis</span><input className="input" type="date" name="ends_on" required /></label>
      <label className="min-w-40 flex-1"><span className="label">Notiz</span><input className="input" name="notes" placeholder="z. B. Nachbarin gießt" /></label>
      <button className="btn" disabled={pending}>Eintragen</button>
      <FormStatus state={state} />
    </form>
  );
}

export function DeleteVacation({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-stone-400 hover:text-rose-600" disabled={pending} onClick={() => start(async () => void (await deleteVacation(id)))}>
      Löschen
    </button>
  );
}

/** Random, hard-to-guess topic: anyone who knows the topic can read the notifications. */
function newTopic() {
  return `pflanzen-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Weekday toggles (ISO 1–7) for the shared watering routine. */
export function WateringDaysForm({ days }: { days: number[] }) {
  const [state, onSubmit, pending] = useFormAction(saveWateringDays);
  const [picked, setPicked] = useState(days);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((label, i) => {
          const day = i + 1;
          const on = picked.includes(day);
          return (
            <label
              key={day}
              className={`flex size-11 cursor-pointer items-center justify-center rounded-full text-sm font-medium transition ${on ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950" : "bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"}`}
            >
              <input
                type="checkbox"
                name="day"
                value={day}
                checked={on}
                onChange={() => setPicked((cur) => (on ? cur.filter((d) => d !== day) : [...cur, day]))}
                className="sr-only"
              />
              {label}
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={pending}>Speichern</button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function NotifyForm({ settings }: { settings: { ntfy_topic: string | null; quiet_from: number | null; quiet_to: number | null } }) {
  const [state, onSubmit, pending] = useFormAction(saveNotifySettings);
  const [topic, setTopic] = useState(settings.ntfy_topic ?? "");
  const [test, setTest] = useState<ActionResult | null>(null);
  const [testing, start] = useTransition();
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="label">ntfy-Topic</span>
          <input className="input font-mono" name="ntfy_topic" value={topic} onChange={(e) => setTopic(e.target.value.trim())} placeholder="leer = aus" />
        </label>
        {!topic && <button type="button" className="btn-ghost" onClick={() => setTopic(newTopic())}>Topic erzeugen</button>}
        {topic && <CopyButton text={topic} />}
        <button
          type="button"
          className="btn-ghost"
          disabled={testing || !topic}
          onClick={() => start(async () => setTest(await sendTestPush(topic)))}
        >
          {testing ? "Sende…" : "Test senden"}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-28"><span className="label">Ruhe ab (Uhr)</span><input className="input" name="quiet_from" type="number" min="0" max="23" defaultValue={settings.quiet_from ?? ""} /></label>
        <label className="w-28"><span className="label">bis (Uhr)</span><input className="input" name="quiet_to" type="number" min="0" max="23" defaultValue={settings.quiet_to ?? ""} /></label>
        <button className="btn" disabled={pending}>Speichern</button>
        <FormStatus state={state} />
      </div>
      {test && <FormStatus state={test} />}
    </form>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {}
      }}
    >
      {copied ? "✓ Kopiert" : "Kopieren"}
    </button>
  );
}

export function UnignoreSensor({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost shrink-0" disabled={pending} onClick={() => start(async () => void (await unignoreSensor(id)))}>
      {pending ? "…" : "Zurückholen"}
    </button>
  );
}

export function RestorePlant({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost shrink-0" disabled={pending} onClick={() => start(async () => void (await restorePlant(id)))}>
      {pending ? "…" : "Zurückholen"}
    </button>
  );
}

const noSubscribe = () => () => {};

/** The watering list for a plant sitter: preview, then share (iOS share sheet) or copy. */
export function SitterList({ text }: { text: string }) {
  // server render: no share button; the client adds it where the browser has a share sheet
  const canShare = useSyncExternalStore(noSubscribe, () => "share" in navigator, () => false);
  return (
    <details className="group rounded-2xl border border-stone-200 dark:border-stone-800">
      <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Gießliste für die Vertretung
        <span className="text-xs font-normal text-stone-500 group-open:hidden">anzeigen</span>
      </summary>
      <div className="space-y-3 border-t border-stone-200 p-3 dark:border-stone-800">
        <pre className="font-sans text-sm whitespace-pre-wrap text-stone-700 dark:text-stone-300">{text}</pre>
        <div className="flex gap-2">
          {canShare && (
            <button type="button" className="btn" onClick={() => navigator.share({ text }).catch(() => {})}>
              Teilen
            </button>
          )}
          <CopyButton text={text} />
        </div>
      </div>
    </details>
  );
}
