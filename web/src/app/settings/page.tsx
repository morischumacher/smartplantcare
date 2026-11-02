import type { Metadata } from "next";
import { signOut } from "@/app/actions";
import { Suspense } from "react";
import { DeleteVacation, NotifyForm, RoomForm, SensorForm, VacationForm } from "@/components/settings-forms";
import { Skeleton } from "@/components/ui";
import { getNotifySettings, getRooms, getSensors, getVacations } from "@/lib/data";
import { date, relTime } from "@/lib/format";

export const metadata: Metadata = { title: "Einstellungen" };

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h1>Einstellungen</h1>
      <Suspense fallback={<Skeleton className="h-[36rem]" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const [rooms, sensors, vacations, notify] = await Promise.all([getRooms(), getSensors(), getVacations(), getNotifySettings()]);
  const hygrometers = sensors.filter((s) => s.type === "hygrometer").map((s) => ({ id: s.id, name: s.name ?? s.mac }));

  return (
    <>
      <section className="space-y-3">
        <div>
          <h2 className="h2">Räume</h2>
          <p className="text-sm text-stone-500">Pro Raum ein Hygrometer für Luftfeuchte und Temperatur.</p>
        </div>
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
      </section>


      <section id="benachrichtigungen" className="scroll-mt-20 space-y-3">
        <div>
          <h2 className="h2">Benachrichtigungen</h2>
          <p className="text-sm text-stone-500">
            Push über die App ntfy: dort dasselbe Topic abonnieren. Gemeldet wird, was jetzt gegossen werden muss, Raumklima, Gieß-Auffälligkeiten
            und stumme Sensoren – neu Aufgetretenes sofort, Andauerndes einmal am Tag. In der Ruhezeit und im Urlaub kommt nur Kritisches.
          </p>
        </div>
        <div className="card p-4">
          {notify ? <NotifyForm settings={notify} /> : <p className="text-sm text-stone-500">Wird gerade eingerichtet – Datenbank noch nicht aktualisiert.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="h2">Urlaub</h2>
          <p className="text-sm text-stone-500">In dieser Zeit fließt Gießen nicht ins Lernen ein (z. B. wenn jemand anderes gießt) und es kommen nur kritische Benachrichtigungen.</p>
        </div>
        <div className="card space-y-4 p-4">
          {vacations.length > 0 && (
            <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
              {vacations.map((v) => (
                <li key={v.id} className="flex items-center gap-3 py-2">
                  <span>{date(v.starts_on)} – {date(v.ends_on)}</span>
                  {v.notes && <span className="text-stone-500">{v.notes}</span>}
                  <span className="ml-auto"><DeleteVacation id={v.id} /></span>
                </li>
              ))}
            </ul>
          )}
          <VacationForm />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="h2">Sensoren</h2>
          <p className="text-sm text-stone-500">Neue Sensoren tauchen automatisch auf, sobald das Gateway sie empfängt. Pflanzen-Sensoren ordnest du in der Pflanze zu.</p>
        </div>
        {sensors.length === 0 ? (
          <p className="text-sm text-stone-500">Noch keine Sensoren.</p>
        ) : (
          <div className="card divide-y divide-stone-100 dark:divide-stone-800">
            {sensors.map((s) => (
              <div key={s.id} className="space-y-2 p-4">
                <div className="flex flex-wrap gap-x-3 text-xs text-stone-500">
                  <span className="font-medium text-stone-700 dark:text-stone-200">{s.type === "hygrometer" ? "Hygrometer" : "Flower Care"}</span>
                  <span className="font-mono">{s.mac}</span>
                  <span>zuletzt {relTime(s.last_seen_at)}</span>
                  {s.last_battery !== null && <span>Akku {s.last_battery} %</span>}
                  {s.last_rssi !== null && <span>{s.last_rssi} dBm</span>}
                </div>
                <SensorForm sensor={s} rooms={rooms} />
              </div>
            ))}
          </div>
        )}
      </section>

      <form action={signOut} className="sm:hidden">
        <button className="btn-ghost w-full">Abmelden</button>
      </form>
    </>
  );
}
