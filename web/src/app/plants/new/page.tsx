import type { Metadata } from "next";
import { Suspense } from "react";
import { PlantForm } from "@/components/plant-forms";
import { Skeleton } from "@/components/ui";
import { getRooms, getSensors, getSpeciesList } from "@/lib/data";
import { sensorOptions } from "@/lib/sensors";

export const metadata: Metadata = { title: "Neue Pflanze" };

export default function NewPlantPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-5">Neue Pflanze</h1>
      <div className="card p-5">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Form />
        </Suspense>
      </div>
    </div>
  );
}

async function Form() {
  const [rooms, sensors, species] = await Promise.all([getRooms(), getSensors(), getSpeciesList()]);
  return <PlantForm rooms={rooms} sensors={await sensorOptions(sensors)} species={species} />;
}
