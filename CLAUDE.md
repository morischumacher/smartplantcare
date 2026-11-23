# Smart Plant Monitor

Eigenes System zur Pflanzenüberwachung: BLE-Sensoren → ESPHome-Gateway → Supabase → Web-App, iPhone-Widget, Garmin-Glance. Der vollständige Projektplan steht in [PLAN.md](PLAN.md) – bei Fragen zu Features und Reihenfolge dort nachsehen.

## Ziele (Kernfunktionen)

- **Lernen aus dem Gießen:** pro Pflanze ml pro Prozentpunkt Feuchteanstieg, Austrocknungsrate, Prognose nächster Gießzeitpunkt; getrennt nach Jahreszeit; Urlaubsgießen zählt nicht als Lernwert
- **Pflanzen mit Topfgröße und Raum**, Gruppierung pro Raum mit einem Hygrometer
- **Aktive Hinweise:** Gießen, Luftfeuchte (befeuchten / lüften), Temperatur, Licht, Dünger, Sensor-Ausfall
- **Automatische Winterruhe** je nach Pflanzenart, Datum und Messwerten (keine manuelle Einstellung)
- **Urlaubsmodus** mit Vorab-Gießplan, nur kritischen Warnungen, optional Gieß-Liste für Vertretung
- Später: automatische Luftbefeuchtung über Shelly Plug S Gen3 (Hysterese, Schutzzeiten)

## Architektur

```
Flower Care (HHCCJCY01) ─┐
Govee H5075 ─────────────┼─ BLE ─▶ Atom Lite / ESPHome ─ HTTPS POST ─▶ Supabase Edge Function `ingest`
                         ┘                                                   │
                                                                   Postgres (readings, plants, …)
                                                                             │
                              Edge Function `summary` (read-only, Read-Token) ◀──┤
                                 │                                           │
                 Scriptable-Widget, Garmin-Glance          Web-App (PWA, Supabase Auth)
                                                           ntfy-Push über `notify` (pg_cron, 15 Min.)
```

- Supabase (Free Tier) ist die einzige Datenquelle, kein Homeserver.
- Clients mit wenig Logik (Scriptable, Garmin) lesen nur `summary`.
- Die gesamte Fachlogik (Gieß-Empfehlung, Hinweise, Winterruhe) lebt im Backend, nicht in den Clients. Reine Logik liegt in `backend/supabase/functions/_shared/` ohne Deno-/Supabase-Imports, damit sie mit `node --test` testbar ist.
- Umtopfen = neue Zeile in `pots`; Lernen nutzt nur Daten der aktuellen Topf-Periode, die vorherige dient (skaliert) als Startwert.
- Pflanzenarten (`species`) liefern Startwerte für neue Pflanzen; die Werte der Pflanze selbst bleiben maßgeblich und werden durch Lernen angepasst.
- KI-Funktionen nutzen Claude über `@anthropic-ai/sdk` (Modell `claude-opus-5-5`, `fallbacks: "default"`).

## Ordnerstruktur

| Ordner | Inhalt |
| --- | --- |
| `firmware/` | ESPHome-YAML für den M5Stack Atom Lite |
| `backend/supabase/` | Supabase-Projekt `zvymcgkkjrfxqoartwrp` (eu-west-1): `migrations/` (SQL), `functions/` (Deno Edge Functions); Deploy automatisch per GitHub-Integration bei Push auf `main` |
| `web/` | Web-App: Next.js 16 (App Router, Cache Components) als PWA auf Vercel, Supabase Auth; Doku zur Next-Version in `web/node_modules/next/dist/docs/` |
| `scriptable/` | JavaScript für das iPhone-Widget |
| `garmin/` | Connect-IQ-Projekt (Monkey C) für den Forerunner 165 |

## Konventionen

- **Sprache:** Code, Bezeichner, DB-Tabellen/-Spalten und Commits auf Englisch; Doku und UI-Texte auf Deutsch.
- **Einheiten:** Feuchte in %, Temperatur in °C, Licht in lux, Leitfähigkeit in µS/cm, Wasser in ml, Topfvolumen in Litern. Spaltennamen tragen die Einheit, wo sie nicht offensichtlich ist (`pot_volume_l`, `amount_ml`).
- **Zeit:** immer `timestamptz` in UTC speichern; Umrechnung nach Europe/Berlin erst in den Clients.
- **Datenbank:** Schemaänderungen nur als neue Datei in `backend/supabase/migrations/` (nie alte Migrationen ändern, sobald sie deployt sind). RLS ist auf allen Tabellen aktiv.
- **Secrets:** nie ins Repo. Lokal in `backend/supabase/functions/.env` (gitignored), produktiv per `supabase secrets set`.
- **Sensoren** werden über ihre BLE-MAC-Adresse (Großbuchstaben, mit Doppelpunkten) identifiziert. Die Firmware erkennt Sensoren automatisch (keine MACs im YAML), unbekannte MACs legt `ingest` als neue Sensoren an.
- **Firmware:** BLE-Auswertung liegt in `firmware/plant_ble.h` ohne ESPHome-Abhängigkeiten, damit sie am Mac testbar ist; das YAML ruft sie nur auf.
- Vor größeren Entscheidungen (Framework, neue Dienste, Datenmodell-Umbauten) nachfragen.
- Nach jedem Umsetzungsschritt testen, dann committen und pushen – ohne Rückfrage, solange die Tests grün sind. Ablauf im Skill `/ship` (`.claude/skills/ship/`).

## Befehle

```bash
cd backend
npx supabase start                         # lokale Supabase (Docker)
npx supabase db reset                      # Migrationen neu anwenden
npx supabase functions serve --env-file supabase/functions/.env
node --test supabase/functions/           # Unit-Tests (ingest-Validierung, Gieß-Logik)
```

```bash
cd firmware
test/run.sh                                # Unit-Tests für die BLE-Auswertung (plant_ble.h)
esphome run plant-gateway.yaml             # Firmware bauen + flashen (USB oder OTA)
```

```bash
cd web
npm run dev                                # http://localhost:3000, braucht web/.env.local
npm run build && npm run lint && npm test   # test: IFC-Umrechnung (src/lib/*.test.ts)
```

## Stand

- [x] Schritt 1: Schema + `ingest`
- [x] Schritt 2: ESPHome auf dem Atom Lite – läuft im WLAN und sendet an `ingest`; Knopf = sofort senden, LED = Status (siehe `firmware/README.md`); Updates per OTA an `plant-gateway.local`
- [x] Schritt 3: `summary` + Gieß-Logik (Lernen, Umtopfen, Gießen erkennen), Foto-Tagebuch + KI-Check (`analyze-photo`)
- [x] Schritt 4: Web-App – live auf https://smartplantcare-umber.vercel.app (Vercel-Projekt `smartplantcare`, Root `web`, Deploy bei Push auf `main`)
- [x] Schritt 5: ntfy – `notify` per pg_cron alle 15 Min., Topic und Ruhezeit in der Web-App (Einstellungen)
- [x] Schritt 6: Scriptable – Widget läuft auf dem iPhone (`node --test scriptable/test/`)
- [x] Schritt 7: Garmin – läuft auf der Forerunner 165 Music als private Beta-App im Connect IQ Store (USB-Sideload per OpenMTP klappt am Mac nicht; neue Versionen als `.iq` exportieren und dort hochladen, siehe `garmin/README.md`)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
