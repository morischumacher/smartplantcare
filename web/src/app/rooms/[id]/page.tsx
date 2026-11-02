import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MapLegend } from "@/components/floor-plan";
import { RoomMapEditor } from "@/components/room-map-editor";
import { Skeleton } from "@/components/ui";
import { getRoom, getSummary, signedUrls } from "@/lib/data";
import { num } from "@/lib/format";
import type { FloorPlan } from "@/lib/types";

export default function RoomPage({ params }: PageProps<"/rooms/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem]" />}>
      <Room params={params} />
    </Suspense>
  );
}

async function Room({ params }: Pick<PageProps<"/rooms/[id]">, "params">) {
  const { id } = await params;
  const [room, summary] = await Promise.all([getRoom(id), getSummary()]);
  if (!room) notFound();
  const plants = summary.rooms.find((r) => r.id === id)?.plants ?? [];
  const climate = summary.rooms.find((r) => r.id === id)?.climate;
  const paths = (room.photo_paths as string[]) ?? [];
  const urls = await signedUrls(paths);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-stone-500"><Link href="/" className="hover:underline">Übersicht</Link></p>
        <h1 className="text-2xl font-semibold">{room.name}</h1>
        {climate && (
          <p className="text-sm text-stone-500">
            {num(climate.temperature, 1)} °C · {num(climate.humidity)} % Luftfeuchte (Ziel {climate.target.min}–{climate.target.max} %)
          </p>
        )}
      </div>
      <RoomMapEditor
        roomId={id}
        plan={room.floor_plan as FloorPlan | null}
        plants={plants}
        photos={paths.map((p) => ({ path: p, url: urls.get(p) ?? null }))}
      />
      <MapLegend />
    </div>
  );
}
