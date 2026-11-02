// Shapes returned by the `summary` Edge Function and stored in rooms.floor_plan.

export type Status = "ok" | "water_soon" | "water_now" | "no_data";

export interface Hint {
  code: string;
  severity: "info" | "warning";
  message: string;
}

export interface PlantSummary {
  id: string;
  name: string;
  species: string | null;
  room_id: string | null;
  map: { x: number; y: number } | null;
  moisture: number | null;
  temperature: number | null;
  light: number | null;
  conductivity: number | null;
  light_peak_7d: number | null;
  target: { min: number; max: number };
  status: Status;
  recommended_ml: number | null;
  next_watering_at: string | null;
  learning: {
    ml_per_point: number | null;
    dry_rate_per_day: number | null;
    source: "learned" | "previous_pot" | "pot_size" | "none";
    samples: number;
    confidence: "estimate" | "low" | "medium" | "high";
    pot_since: string;
  };
  pending_waterings: { ts: string; before: number; peak: number }[];
  hints: Hint[];
  photo_request: { reason: string; message: string } | null;
}

export interface FloorPlan {
  width_m: number;
  depth_m: number;
  outline: [number, number][];
  features: { kind: "window" | "door" | "heater"; x1: number; y1: number; x2: number; y2: number }[];
  furniture: { label: string; x: number; y: number; w: number; h: number }[];
  source: "ai" | "manual";
  generated_at?: string;
}

export interface RoomSummary {
  id: string | null;
  name: string;
  climate: {
    temperature: number | null;
    humidity: number | null;
    target: { min: number; max: number };
    status: "ok" | "too_dry" | "too_humid" | "no_data";
    ts: string | null;
  } | null;
  floor_plan: FloorPlan | null;
  plants: PlantSummary[];
}

export interface Summary {
  generated_at: string;
  attention: number;
  rooms: RoomSummary[];
}

export interface HourPoint {
  hour: string;
  moisture: number | null;
  temperature: number | null;
  light: number | null;
  conductivity: number | null;
}
