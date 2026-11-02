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
                                                           ntfy-Push über `notify` (cron)
```

- Supabase (Free Tier) ist die einzige Datenquelle, kein Homeserver.
- Clients mit wenig Logik (Scriptable, Garmin) lesen nur `summary`.
- Die gesamte Fachlogik (Gieß-Empfehlung, Hinweise, Winterruhe) lebt im Backend, nicht in den Clients.

## Ordnerstruktur

| Ordner | Inhalt |
| --- | --- |
| `firmware/` | ESPHome-YAML für den M5Stack Atom Lite |
| `backend/supabase/` | Supabase-Projekt `zvymcgkkjrfxqoartwrp` (eu-west-1): `migrations/` (SQL), `functions/` (Deno Edge Functions); Deploy automatisch per GitHub-Integration bei Push auf `main` |
| `web/` | Web-App (PWA, Vercel) – Framework noch offen |
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
- Nach jedem Umsetzungsschritt testen, dann committen.

## Befehle

```bash
cd backend
npx supabase start                         # lokale Supabase (Docker)
npx supabase db reset                      # Migrationen neu anwenden
npx supabase functions serve --env-file supabase/functions/.env
node --test supabase/functions/ingest/     # Unit-Tests für die Payload-Validierung
```

```bash
cd firmware
test/run.sh                                # Unit-Tests für die BLE-Auswertung (plant_ble.h)
esphome run plant-gateway.yaml             # Firmware bauen + flashen (USB oder OTA)
```

## Stand

- [x] Schritt 1: Schema + `ingest`
- [ ] Schritt 2: ESPHome auf dem Atom Lite – Firmware fertig und kompiliert, Test mit echter Hardware steht aus
- [ ] Schritt 3: `summary` + Gieß-Logik
- [ ] Schritt 4: Web-App
- [ ] Schritt 5: ntfy
- [ ] Schritt 6: Scriptable
- [ ] Schritt 7: Garmin
