"use client";

import { useState } from "react";
import { FloorPlanMap } from "@/components/floor-plan";
import { PlantList } from "@/components/plant-card";
import type { FloorPlan, PlantSummary } from "@/lib/types";

// A room's plant list next to its map (large screens): hovering or focusing a row points the plant out on the map.
export function RoomPlants({ plan, plants }: { plan: FloorPlan | null; plants: PlantSummary[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const withMap = plan !== null && plants.some((p) => p.map);
  return (
    <div className={withMap ? "grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}>
      {withMap && (
        <div className="card hidden p-3 lg:sticky lg:top-20 lg:block">
          <FloorPlanMap plan={plan} plants={plants} compact highlight={hovered} />
        </div>
      )}
      <PlantList plants={plants} onHover={setHovered} />
    </div>
  );
}
