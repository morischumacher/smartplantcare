import type { IfcAPI } from "web-ifc";
import type { ElementKind, IfcElement } from "@/lib/ifc-plan";

// Reads walls, windows, doors and furniture from an IFC file with web-ifc (WASM) and returns their
// footprints in plan view. web-ifc delivers metres with Y pointing up, so the plan is the X/Z plane.

type WebIfc = typeof import("web-ifc");

const KINDS: [ElementKind, (w: WebIfc) => number[]][] = [
  ["wall", (w) => [w.IFCWALL, w.IFCWALLSTANDARDCASE]],
  ["window", (w) => [w.IFCWINDOW]],
  ["door", (w) => [w.IFCDOOR]],
  ["furniture", (w) => [w.IFCFURNISHINGELEMENT, w.IFCFURNITURE]],
];

export function extractElements(w: WebIfc, api: IfcAPI, modelId: number): IfcElement[] {
  const out: IfcElement[] = [];
  for (const [kind, types] of KINDS) {
    for (const type of types(w)) {
      const ids = api.GetLineIDsWithType(modelId, type);
      for (let i = 0; i < ids.size(); i++) {
        const id = ids.get(i);
        const points: [number, number][] = [];
        const mesh = api.GetFlatMesh(modelId, id);
        for (let g = 0; g < mesh.geometries.size(); g++) {
          const placed = mesh.geometries.get(g);
          const geometry = api.GetGeometry(modelId, placed.geometryExpressID);
          const v = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
          const m = placed.flatTransformation;
          for (let j = 0; j < v.length; j += 6) {
            const [x, y, z] = [v[j], v[j + 1], v[j + 2]];
            points.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[2] * x + m[6] * y + m[10] * z + m[14]]);
          }
          (geometry as { delete?: () => void }).delete?.();
        }
        (mesh as { delete?: () => void }).delete?.();
        const line = api.GetLine(modelId, id);
        const label = [line?.Name?.value, line?.ObjectType?.value].filter(Boolean).join(" ") || null;
        out.push({ kind, label, points });
      }
    }
  }
  return out;
}

/** Browser: parse an uploaded IFC file. The WASM file is copied to /public by the postinstall script. */
export async function readIfc(file: File): Promise<IfcElement[]> {
  const w = await import("web-ifc");
  const api = new w.IfcAPI();
  await api.Init((path) => `/${path}`, true);
  const modelId = api.OpenModel(new Uint8Array(await file.arrayBuffer()), { COORDINATE_TO_ORIGIN: true });
  try {
    return extractElements(w, api, modelId);
  } finally {
    api.CloseModel(modelId);
  }
}
