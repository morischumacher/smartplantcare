"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { useActionState, useTransition } from "react";
import { addVacation, deleteRoom, deleteSensor, deleteVacation, saveRoom, saveSensor } from "@/app/actions";
import { FormStatus } from "@/components/form-status";

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
  const [state, action, pending] = useActionState(saveRoom, null);
  const [deleting, start] = useTransition();
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
      {room && <input type="hidden" name="id" value={room.id} />}
      <label>
        <span className="label">Name</span>
        <input className="input" name="name" defaultValue={room?.name} required placeholder="z. B. Wohnzimmer" />
      </label>
      <label>
        <span className="label">Luftfeuchte min %</span>
        <input className="input" name="humidity_min" type="number" defaultValue={room?.humidity_min ?? 40} />
      </label>
      <label>
        <span className="label">max %</span>
        <input className="input" name="humidity_max" type="number" defaultValue={room?.humidity_max ?? 60} />
      </label>
      <label>
        <span className="label">Hygrometer</span>
        <select className="input" name="hygrometer_id" defaultValue={hygrometerId ?? ""}>
          <option value="">– keins –</option>
          {hygrometers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <div className="flex gap-1">
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
      <div className="sm:col-span-5"><FormStatus state={state} /></div>
    </form>
  );
}

export function SensorForm({ sensor, rooms }: { sensor: { id: string; name: string | null; mac: string; type: string; room_id: string | null }; rooms: Option[] }) {
  const [state, action, pending] = useActionState(saveSensor, null);
  const [deleting, start] = useTransition();
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
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
        question="Sensor samt allen Messwerten löschen?"
        onConfirm={() => start(async () => void (await deleteSensor(sensor.id)))}
      >
        Löschen
      </ConfirmButton>
      <FormStatus state={state} />
    </form>
  );
}

export function VacationForm() {
  const [state, action, pending] = useActionState(addVacation, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
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
