import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsHeader } from "@/components/settings-ui";
import { Skeleton } from "@/components/ui";
import { summarize, usd } from "@/lib/ai-cost";
import { AI_COPY_BUDGET } from "@/lib/ai-copy";
import { getAiUsage } from "@/lib/data";

export const metadata: Metadata = { title: "KI-Kosten" };

const DAYS = 30;
const n = (v: number) => v.toLocaleString("de-AT");

export default function AiCostPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="KI-Kosten">
        Jeder KI-Aufruf (Foto-Check, Arten-Erkennung, Raumplan) wird mit seinen Tokens protokolliert. Hier siehst du, was die KI in den letzten {DAYS} Tagen gekostet hat und wie die App Tokens spart.
      </SettingsHeader>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Usage />
      </Suspense>
    </div>
  );
}

async function Usage() {
  const s = summarize(await getAiUsage(DAYS));
  return (
    <div className="space-y-5">
      {s.calls === 0 ? (
        <div className="card p-4 text-sm text-stone-500">Noch keine KI-Aufrufe protokolliert. Der nächste Foto-Check taucht hier auf.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Aufrufe" value={n(s.calls)} />
            <Tile label="Tokens rein / raus" value={`${n(s.inputTokens)} / ${n(s.outputTokens)}`} />
            <Tile label="Kosten" value={usd(s.costUsd)} hint="Listenpreise der Claude API" />
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-800/40">
                <tr>
                  <th className="px-4 py-2 font-medium">Funktion</th>
                  <th className="px-2 py-2 text-right font-medium">Aufrufe</th>
                  <th className="px-2 py-2 text-right font-medium">Ø rein</th>
                  <th className="px-2 py-2 text-right font-medium">Ø raus</th>
                  <th className="px-4 py-2 text-right font-medium">Kosten</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {s.byFunction.map((f) => (
                  <tr key={f.fn}>
                    <td className="px-4 py-2.5">{f.label}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{n(f.calls)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{n(f.avgInput)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{n(f.avgOutput)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{usd(f.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="pt-2">So spart die App Tokens</h2>
      <div className="card divide-y divide-stone-100 dark:divide-stone-800">
        <Measure
          status="active"
          title="Kleinere Fotos für die KI"
          source={{ label: "Anthropic: Bildkosten", href: "https://platform.claude.com/docs/en/build-with-claude/vision" }}
        >
          Claude rechnet Bilder in 28 × 28-Pixel-Blöcken ab; ein 1600-px-Foto kostet rund 2.500 Bild-Tokens. Die App schickt deshalb eine KI-Kopie mit
          höchstens {n(AI_COPY_BUDGET)} Tokens.{" "}
          {s.images ? (
            <strong className="font-medium text-emerald-800 dark:text-emerald-300">
              In {DAYS} Tagen gespart: {n(s.images.savedTokens)} Tokens ({Math.round(s.images.savedShare * 100)} % der Bild-Tokens, ≈ {usd(s.images.savedUsd)}).
            </strong>
          ) : (
            "Wirkt ab dem nächsten hochgeladenen Foto."
          )}
        </Measure>
        <Measure status="active" title="Feste Antwortstruktur">
          Claude antwortet in einem festen JSON-Schema statt in Fließtext. Die Antworten bleiben kurz, und die App muss nichts aus langen Texten herauslesen.
        </Measure>
        <Measure
          status="active"
          title="Passende Denktiefe"
          source={{ label: "Han et al.: Token-Budget-Aware LLM Reasoning", href: "https://arxiv.org/abs/2412.18547" }}
        >
          Foto-Check und Arten-Erkennung laufen mit mittlerer Denktiefe, nur der Raumplan mit hoher. Studien zeigen, dass Modelle sonst oft länger nachdenken, als die Aufgabe braucht.
        </Measure>
        <Measure
          status="no"
          title="Prompt Caching"
          source={{ label: "Anthropic: Prompt Caching", href: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching" }}
        >
          Spart bei langen, gleichbleibenden Prompts bis zu 90 %. Hier ist der feste Teil kurz, und zwischen zwei Aufrufen liegen meist Tage – der Cache wäre längst abgelaufen.
        </Measure>
        <Measure
          status="idea"
          title="Günstigeres Modell zuerst"
          source={{ label: "Chen et al.: FrugalGPT", href: "https://arxiv.org/abs/2305.05176" }}
        >
          Eine Modell-Kaskade würde eindeutige Fotos von einem kleineren Modell prüfen lassen und nur unklare an Opus geben. Lohnt sich erst bei deutlich mehr Fotos.
        </Measure>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 font-display text-xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

const STATUS = {
  active: { label: "Aktiv", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" },
  no: { label: "Hier nicht sinnvoll", cls: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
  idea: { label: "Nächster Schritt", cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200" },
};

function Measure({ status, title, source, children }: { status: keyof typeof STATUS; title: string; source?: { label: string; href: string }; children: React.ReactNode }) {
  const st = STATUS[status];
  return (
    <div className="space-y-1.5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-300">{children}</p>
      {source && (
        <a href={source.href} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 hover:underline dark:text-emerald-400">
          {source.label} ↗
        </a>
      )}
    </div>
  );
}
