import { num, relTime } from "@/lib/format";
import type { PlantSummary } from "@/lib/types";

// Turns a plant's summary into the short list of things to do, used on cards and map tooltips.

export type Todo = { level: "urgent" | "todo" | "done" | "info"; text: string };

export function plantTodos(p: PlantSummary): Todo[] {
  const todos: Todo[] = [];
  if (p.status === "water_now") {
    todos.push({ level: "urgent", text: p.recommended_ml ? `Jetzt ca. ${num(p.recommended_ml)} ml gießen` : "Jetzt gießen" });
  } else if (p.status === "water_soon" && p.next_watering_at) {
    todos.push({ level: "todo", text: `Gießen ${relTime(p.next_watering_at)}` });
  } else if (p.status === "no_data") {
    todos.push({ level: "todo", text: "Noch keine Messwerte" });
  }
  if (p.pending_waterings.length > 0) {
    todos.push({
      level: "todo",
      text: p.pending_waterings.length === 1 ? "Erkanntes Gießen bestätigen" : `${p.pending_waterings.length}× erkanntes Gießen bestätigen`,
    });
  }
  if (p.photo_request) todos.push({ level: "todo", text: "Tagebuch-Foto fällig" });
  for (const h of p.hints) {
    if (h.code === "confirm_watering") continue; // covered by pending_waterings
    if (h.code === "just_watered") {
      todos.unshift({ level: "done", text: "✓ Gerade gegossen" });
      continue;
    }
    todos.push({ level: h.severity === "warning" ? "urgent" : "info", text: h.message });
  }
  return todos;
}
