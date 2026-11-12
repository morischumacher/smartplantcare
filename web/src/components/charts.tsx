"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourPoint } from "@/lib/types";

// Sensor history: moisture with target band and watering markers, temperature, light.

type Props = {
  data: HourPoint[];
  target: { min: number; max: number };
  waterings: { ts: string; amount_ml: number | null }[];
  days: number;
  /** Server time of the data, used as the chart's right edge. */
  now: number;
};

const tick = (days: number) => (t: number) =>
  new Date(t).toLocaleDateString("de-DE", days <= 7 ? { weekday: "short" } : { day: "numeric", month: "numeric" });

const tooltipTime = (t: unknown) =>
  new Date(Number(t)).toLocaleString("de-DE", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

const axis = { stroke: "#a5a091", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: "1px solid #e3e0d5", fontSize: 12, background: "rgba(255,255,255,0.95)", color: "#1f1e1a" },
  labelFormatter: tooltipTime,
};

export function SensorCharts({ data, target, waterings, days, now }: Props) {
  const points = data.map((p) => ({ ...p, t: new Date(p.hour).getTime() }));
  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-stone-500">Noch keine Messwerte im Zeitraum.</p>;
  }
  const domain: [number, number] = [now - days * 86_400_000, now];
  const x = <XAxis dataKey="t" type="number" scale="time" domain={domain} tickFormatter={tick(days)} {...axis} minTickGap={24} />;

  return (
    <div className="space-y-5">
      <Panel title="Bodenfeuchte" unit="%">
        <ComposedChart data={points} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="moist" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#417587" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#417587" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e3e0d5" strokeOpacity={0.5} />
          {x}
          <YAxis domain={[0, (max: number) => Math.max(60, Math.ceil(max / 10) * 10)]} {...axis} />
          <ReferenceArea y1={target.min} y2={target.max} fill="#348152" fillOpacity={0.08} />
          <ReferenceLine y={target.min} stroke="#c25637" strokeDasharray="4 4" strokeOpacity={0.6} />
          {waterings.map((w) => (
            <ReferenceLine
              key={w.ts}
              x={new Date(w.ts).getTime()}
              stroke="#345e6e"
              strokeDasharray="2 3"
              label={{ value: w.amount_ml === null ? "gegossen" : `${w.amount_ml} ml`, position: "insideTopLeft", fontSize: 10, fill: "#345e6e" }}
            />
          ))}
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v} %`, "Feuchte"]} />
          <Area type="monotone" dataKey="moisture" stroke="#417587" strokeWidth={2} fill="url(#moist)" connectNulls dot={false} />
        </ComposedChart>
      </Panel>
      <div className="grid gap-5 sm:grid-cols-2">
        <Panel title="Temperatur" unit="°C" small>
          <ComposedChart data={points} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="#e3e0d5" strokeOpacity={0.5} />
            {x}
            <YAxis domain={["dataMin - 2", "dataMax + 2"]} {...axis} allowDecimals={false} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v} °C`, "Temperatur"]} />
            <Line type="monotone" dataKey="temperature" stroke="#d5714f" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </Panel>
        <Panel title="Licht" unit="lx" small>
          <ComposedChart data={points} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="light" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d5a434" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#d5a434" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e3e0d5" strokeOpacity={0.5} />
            {x}
            <YAxis {...axis} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${Number(v).toLocaleString("de-DE")} lx`, "Licht"]} />
            <Area type="monotone" dataKey="light" stroke="#d5a434" strokeWidth={1.5} fill="url(#light)" dot={false} connectNulls />
          </ComposedChart>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, unit, small, children }: { title: string; unit: string; small?: boolean; children: React.ReactElement }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-stone-500">
        {title} <span className="text-stone-400">({unit})</span>
      </h3>
      <div className={small ? "h-36" : "h-56"}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
