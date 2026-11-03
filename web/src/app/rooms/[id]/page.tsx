import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MapLegend } from "@/components/floor-plan";
import { CandidateList } from "@/components/candidates";
import { PlantList } from "@/components/plant-card";
import { RoomMapEditor } from "@/components/room-map-editor";
import { Skeleton } from "@/components/ui";
import { getCandidates, getRoom, getSpeciesList, getSummary, signedUrls } from "@/lib/data";
import { isUuid, num } from "@/lib/format";
import type { FloorPlan } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/rooms/[id]">): Promise<Metadata> {
  const { id } = await params;
  const p = isUuid(id) ? await getRoom(id) : null;
  return { title: p?.name ?? "Raum" };
}

export default function RoomPage({ params }: PageProps<"/rooms/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem]" />}>
      <Room params={params} />
    </Suspense>
  );
}

async function Room({ params }: Pick<PageProps<"/rooms/[id]">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [room, summary, candidates, species] = await Promise.all([getRoom(id), getSummary(), getCandidates(id), getSpeciesList()]);
  if (!room) notFound();
  const plants = summary.rooms.find((r) => r.id === id)?.plants ?? [];
  const climate = summary.rooms.find((r) => r.id === id)?.climate;
  const paths = (room.photo_paths as string[]) ?? [];
  const urls = await signedUrls(room.scan_path ? [...paths, room.scan_path] : paths);

  return (
    // Found-but-not-added plants and the plant list come first on phones; the floor plan and its setup tools follow.
    <div className="flex flex-col gap-5">
      <div>
        <p className="hidden text-sm text-stone-500 sm:block"><Link href="/" className="hover:underline">Übersicht</Link></p>
        <div className="flex items-start justify-between gap-3">
          <h1>{room.name}</h1>
          <Link href="/settings/rooms" className="btn-ghost shrink-0 px-3">Bearbeiten</Link>
        </div>
        {climate && (
          <p className="text-sm text-stone-500">
            {climate.temperature == null && climate.humidity == null
              ? `Noch keine Klimadaten · Ziel ${climate.target.min}–${climate.target.max} % Luftfeuchte`
              : `${num(climate.temperature, 1)} °C · ${num(climate.humidity)} % Luftfeuchte (Ziel ${climate.target.min}–${climate.target.max} %)`}
          </p>
        )}
      </div>
      <CandidateList candidates={candidates} species={species} />
      {plants.length > 0 && (
        <section className="space-y-3 lg:order-last">
          <h2 className="h2">Pflanzen in diesem Raum</h2>
          <PlantList plants={plants} />
        </section>
      )}
      <section className="space-y-5">
        <h2 className="h2 lg:hidden">Grundriss</h2>
        <RoomMapEditor
          roomId={id}
          plan={room.floor_plan as FloorPlan | null}
          plants={plants}
          photos={paths.map((p) => ({ path: p, url: urls.get(p) ?? null }))}
          candidates={candidates}
          scan={room.scan_path ? { path: room.scan_path, url: urls.get(room.scan_path) ?? null } : null}
          scanPlan={room.scan_plan as FloorPlan | null}
          species={species}
        />
        <MapLegend />
      </section>
    </div>
  );
}
