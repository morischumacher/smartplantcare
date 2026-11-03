"use client";

import { useState } from "react";
import { FloorPlanMap } from "@/components/floor-plan";
import { PlantCard } from "@/components/plant-card";
import type { FloorPlan, PlantSummary } from "@/lib/types";

// A room's plant cards next to its map (large screens): hovering or focusing a card points the plant out on the map.
export function RoomPlants({ plan, plants }: { plan: FloorPlan | null; plants: PlantSummary[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const withMap = plan !== null && plants.some((p) => p.map);
  return (
    <div className={withMap ? "grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}>
      {withMap && (
        <div className="card hidden self-start p-3 lg:sticky lg:top-20 lg:block">
          <FloorPlanMap plan={plan} plants={plants} compact highlight={hovered} />
        </div>
      )}
      <div className={`grid content-start gap-3 sm:grid-cols-2 ${withMap ? "" : "lg:grid-cols-3"}`}>
        {plants.map((p) => (
          <div
            key={p.id}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered((cur) => (cur === p.id ? null : cur))}
            onFocus={() => setHovered(p.id)}
            onBlur={() => setHovered((cur) => (cur === p.id ? null : cur))}
          >
            <PlantCard plant={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
