import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomForm } from "@/components/settings-forms";
import { SettingsHeader } from "@/components/settings-ui";
import { Skeleton } from "@/components/ui";
import { getRooms, getSensors } from "@/lib/data";

export const metadata: Metadata = { title: "Räume" };

export default function RoomsSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Räume">Pflanzen in einem Raum teilen sich das Raumklima. Pro Raum misst ein Hygrometer Luftfeuchte und Temperatur.</SettingsHeader>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Rooms />
      </Suspense>
    </div>
  );
}

async function Rooms() {
  const [rooms, sensors] = await Promise.all([getRooms(), getSensors()]);
  const hygrometers = sensors.filter((s) => s.type === "hygrometer").map((s) => ({ id: s.id, name: s.name ?? s.mac }));
  return (
    <div className="card divide-y divide-stone-100 dark:divide-stone-800">
      {rooms.map((r) => (
        <div key={r.id} className="p-4">
          <RoomForm room={r} hygrometers={hygrometers} hygrometerId={sensors.find((s) => s.type === "hygrometer" && s.room_id === r.id)?.id} />
        </div>
      ))}
      <div className="bg-stone-50/60 p-4 dark:bg-stone-900/40">
        <p className="mb-2 text-sm font-medium">Neuer Raum</p>
        <RoomForm hygrometers={hygrometers} />
      </div>
    </div>
  );
}
