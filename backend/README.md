# Backend (Supabase)

Postgres-Schema und Edge Functions. Die Supabase-CLI läuft über `npx`, eine globale Installation ist nicht nötig. Alle Befehle im Ordner `backend/` ausführen.

## Datenmodell

| Tabelle | Inhalt |
| --- | --- |
| `rooms` | Raum mit Zielbereich Luftfeuchte, Raumfotos (`photo_paths`), optionalem LiDAR-Scan (`scan_path`) und abstraktem Grundriss (`floor_plan`) |
| `sensors` | BLE-Sensor (MAC, Typ `flower_care` / `hygrometer`, Raum, zuletzt gesehen, Batterie, RSSI) |
| `plants` | Pflanze mit Art (`species_id` plus freie Bezeichnung), Raum, Zielbereichen (Feuchte, Licht, Temperatur, Leitfähigkeit), Foto-Intervall und Position auf der Raumkarte (`map_x`, `map_y` in m) |
| `pots` | Topf-Perioden: Volumen, Maße, Erdart, seit wann. Umtopfen = neue Zeile |
| `plant_sensors` | Zuordnung Pflanze ↔ Sensor(en), mehrere Sensoren pro Topf möglich |
| `readings` | Rohmesswerte pro Sensor |
| `waterings` | Gießvorgänge (ml, Urlaub ja/nein, Quelle `manual` oder `detected`) |
| `species` | Pflanzenarten mit Pflegeprofil (Feuchte, Licht, Temperatur, Luftfeuchte, Dünger, Winterruhe, Erde, Giftigkeit), Beispielbild von Wikimedia Commons mit Urheber und Lizenz. Quelle `curated` (Basisliste, 61 Arten), `ai` oder `manual` |
| `plant_candidates` | Auf Raumfotos entdeckte, noch nicht angelegte Pflanzen: Ausschnitt im Foto, Artvermutung, Sicherheit, Position, Nahaufnahme; Status `open`/`accepted`/`dismissed` |
| `plant_photos` | Pflanzentagebuch: Foto im Bucket `plant-photos`, Anlass, KI-Auswertung (`analysis`) |
| `vacations` | Urlaubszeiträume |
| `sensor_latest` (View) | jeweils letzter Messwert pro Sensor |
| `plant_hourly()` (Funktion) | Stundenmittel aller Sensoren einer Pflanze als JSON |

Hygrometer werden über `sensors.room_id` einem Raum zugeordnet, Flower-Care-Sensoren über `plant_sensors` einer Pflanze.

## `ingest`-API

```
POST /functions/v1/ingest
x-device-secret: <INGEST_SECRET>
Content-Type: application/json

{ "readings": [ { "mac": "C4:7C:8D:6A:12:34", "type": "flower_care", "moisture": 23, "temperature": 21.4, "light": 850, "conductivity": 340, "rssi": -71 } ] }
```

- Statt `readings`-Array geht auch ein einzelnes Reading-Objekt.
- Felder: `mac`, `type` (Pflicht), `moisture`, `temperature`, `light`, `conductivity`, `humidity`, `battery`, `rssi`, `ts` (ISO-Zeit, optional – sonst Serverzeit).
- Unbekannte MACs werden automatisch als Sensor angelegt (ohne Name/Raum).
- Ungültige Einträge werden übersprungen und in `errors` gemeldet; die gültigen werden trotzdem gespeichert.
- Antwort: `{ "inserted": 2, "errors": [] }` – Status 200, oder 400 wenn nichts gespeichert wurde, 401 bei falschem Secret.

## `summary`-API

```
GET /functions/v1/summary
x-read-token: <SUMMARY_TOKEN>          (Widget, Garmin)
Authorization: Bearer <Access-Token>   (alternativ: angemeldete Web-App)
```

Liefert alle Räume mit Raumklima und Grundriss (`floor_plan`) und darin die Pflanzen, dringendste zuerst. Pro Pflanze:

| Feld | Bedeutung |
| --- | --- |
| `status` | `water_now` (unter Zielbereich), `water_soon` (in ≤ 2 Tagen), `ok`, `no_data` (kein Messwert seit 3 h) |
| `recommended_ml` | empfohlene Menge bis zum oberen Zielwert (nur bei `water_now`/`water_soon`) |
| `next_watering_at` | Prognose, wann die Untergrenze erreicht wird |
| `learning` | ml pro Prozentpunkt, Austrocknung pro Tag, Quelle (`learned`, `previous_pot`, `pot_size`), Anzahl Gießvorgänge, Sicherheit |
| `pending_waterings` | erkannte, aber nicht eingetragene Gießvorgänge der letzten 7 Tage – Menge bestätigen |
| `hints` | Hinweise, z. B. `stays_wet`, `dries_fast`, `no_recovery`, `relearning`, `photo_findings` |
| `photo_request` | Bitte um ein Foto mit Anlass (`repot`, `anomaly`, `season`, `scheduled`) oder `null` |
| `map` | Position auf der Raumkarte `{x, y}` in Metern oder `null` |
| `light_peak_7d` | hellste Stunde der letzten 7 Tage in lux – zeigt, wie hell der Standort ist |

Oben im JSON steht `attention`: Anzahl Pflanzen, die Wasser brauchen (für Widget und Garmin).

## Wie die App lernt

Die Logik steckt in [`functions/_shared/watering.ts`](supabase/functions/_shared/watering.ts) (mit Tests).

- **Gießen erkennen:** Steigt die Feuchte innerhalb von 3 Stunden um mindestens 8 Punkte, gilt das als Gießen. Eingetragene Gießvorgänge werden damit abgeglichen; nicht eingetragene erscheinen in `pending_waterings`.
- **ml pro Prozentpunkt:** Menge ÷ Feuchteanstieg (Wert vorher → Spitze in den 6 Stunden danach), pro Gießen. Neuere Werte und Werte aus derselben Jahreszeit zählen stärker. Gießen im Urlaub zählt nicht.
- **Startwert:** Ohne eigene Daten gilt `Topfvolumen × Erdfaktor` (z. B. 3 l Blumenerde → 12 ml pro Punkt). Er zählt wie ein Gießvorgang: nach 1 Gießen 50 % gelernt, nach 3 bereits 75 %.
- **Austrocknung:** Steigung der Feuchte zwischen zwei Gießvorgängen (die ersten 12 Stunden danach werden übersprungen, weil sich das Wasser erst verteilt).
- **Umtopfen:** Neue Zeile in `pots` anlegen. Gelernt wird ab dann nur aus Daten im neuen Topf. Als Startwert dienen die Werte des alten Topfs, umgerechnet auf das neue Volumen und die neue Erde; die Austrocknung wird mit √(Volumenverhältnis) skaliert. Die App fragt nach einem Foto und zeigt 3 Wochen lang „lernt neu“.

## KI-Foto-Check (`analyze-photo`)

```
POST /functions/v1/analyze-photo
Authorization: Bearer <Access-Token des angemeldeten Nutzers>
{ "photo_id": "<plant_photos.id>" }
```

Die Web-App lädt das Foto in den Bucket `plant-photos` (Pfad z. B. `<plant_id>/<uuid>.jpg`, JPEG/PNG/WebP, max. 5 MB), legt die Zeile in `plant_photos` an und ruft dann diese Funktion auf. Claude (Opus 5.5) bekommt das Foto, das vorherige Foto und die Sensordaten und liefert Gesundheit, Probleme, Einschätzung zu Wasser und Licht, Wachstum und Empfehlungen. Das Ergebnis steht in `plant_photos.analysis`; ist die Pflanze nicht gesund, erscheint 14 Tage lang ein Hinweis in `summary`.

Kosten: grob 1–2 Cent pro Foto (Anthropic-API-Guthaben nötig).

## Raumkarte (`plan-room`)

```
POST /functions/v1/plan-room
Authorization: Bearer <Access-Token des angemeldeten Nutzers>
{ "room_id": "<rooms.id>", "mode": "plan" }   // mode "plants": nur Pflanzen neu suchen, gespeicherter Grundriss bleibt
```

Pflanzen haben eine Höhe über dem Boden (`plants.map_height_m`, die KI schätzt sie mit): Pflanzen übereinander in einem Regal stehen am selben Punkt, sind aber verschiedene Pflanzen. Abgelehnte Kandidaten werden nicht erneut vorgeschlagen.

Claude zeichnet einen abstrakten Grundriss von oben (Umriss, Fenster, Türen, Heizkörper, große Möbel, alles in Metern) und verortet die Pflanzen. Eingaben:

| Quelle | liefert |
| --- | --- |
| IFC-Scan (`rooms.scan_plan`, optional): wird im Browser mit `web-ifc` in das `floor_plan`-Format umgerechnet | exakte Wände, Fenster, Türen, Möbel – bleiben unverändert, die KI ergänzt nur Heizkörper und Pflanzen |
| iPhone-Scan als Bild (`rooms.scan_path`, optional): Grundriss aus einer LiDAR-App wie ezSpace, Polycam oder magicplan als PDF, Bild oder Screenshot | exakte Maße, Wände, Fenster, Türen |
| Raumfotos (`rooms.photo_paths`, 1–4) | Heizkörper (erkennt RoomPlan nicht), Pflanzen, Möbel; ohne Scan auch die geschätzte Geometrie |
| letztes Tagebuchfoto jeder Pflanze im Raum | Wiedererkennen der angelegten Pflanzen |
| Artenliste aus `species` | Artvermutung für neue Pflanzen |

Antwort: `floor_plan`, Positionen der angelegten Pflanzen und `candidates`. Dieselbe Pflanze auf mehreren Fotos wird zu einem Kandidaten zusammengeführt (gleiche Art, < 1 m auseinander, siehe [`_shared/candidates.ts`](supabase/functions/_shared/candidates.ts)); Kandidaten direkt an einer schon angelegten Pflanze entfallen – neu entdeckte Pflanzen mit Artvermutung, Sicherheit, Position und Ausschnitt im Foto. Die Funktion speichert nichts; die Web-App zeigt den Vorschlag, und beim Speichern landen Grundriss, Positionen und Kandidaten in der Datenbank. Kandidaten bestätigt man einzeln (Name/Art korrigieren), lässt unsichere per Nahaufnahme bestimmen oder verwirft sie.

Kosten: grob 5–15 Cent pro Grundriss.

## Pflanzenarten (`plant-species`)

```
POST /functions/v1/plant-species
Authorization: Bearer <Access-Token>
{ "action": "identify", "photo_path": "…" }   → Art aus einer Nahaufnahme bestimmen
{ "action": "ensure", "name": "Alocasia zebrina" } → vorhandene Art oder neues KI-Profil
{ "action": "images", "limit": 10 }            → Beispielbilder von Wikimedia Commons nachladen
```

Namen werden über [`_shared/species.ts`](supabase/functions/_shared/species.ts) zugeordnet (wissenschaftlich, deutsch, Synonyme wie „Calathea“ oder „Sansevieria“, Sorten in Anführungszeichen werden ignoriert). Eine neue Art legt `identify` nur an, wenn Claude sich mindestens mittel sicher ist. Beim Anlegen einer Pflanze werden Feuchte-, Licht- und Temperaturbereich der Art als Zielwerte übernommen.

## Secrets

Unter **Edge Functions → Secrets** setzen:

| Name | Wofür |
| --- | --- |
| `INGEST_SECRET` | Atom Lite → `ingest` |
| `SUMMARY_TOKEN` | Widget, Garmin → `summary` (`openssl rand -hex 32`); die Web-App nutzt stattdessen den Login |
| `ANTHROPIC_API_KEY` | KI-Foto-Check und Raumkarte, von https://console.anthropic.com |

## Demo-Daten

Zum Ausprobieren ohne Hardware: [`supabase/demo/demo.sql`](supabase/demo/demo.sql) im **SQL Editor** ausführen. Das legt einen Raum, eine Pflanze und 14 Tage simulierte Messwerte an (trocknet 4 Punkte pro Tag, vor 10 und 4 Tagen gegossen, nur das erste Gießen eingetragen). Danach `summary` aufrufen. Wieder entfernen mit [`supabase/demo/demo_cleanup.sql`](supabase/demo/demo_cleanup.sql).

## Lokal testen

Voraussetzung: Docker Desktop läuft.

```bash
cp supabase/functions/.env.example supabase/functions/.env   # INGEST_SECRET eintragen
npx supabase start                                            # erster Start lädt Docker-Images (dauert)
npx supabase functions serve --env-file supabase/functions/.env
```

In einem zweiten Terminal:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/ingest \
  -H "x-device-secret: <dein INGEST_SECRET>" \
  -H "Content-Type: application/json" \
  -d @supabase/functions/ingest/example.json
```

Erwartet: `{"inserted":2,"errors":[]}`. Die Daten siehst du im lokalen Studio unter http://127.0.0.1:54323 (Tabellen `sensors`, `readings`, View `sensor_latest`).

Unit-Tests (ohne Docker):

```bash
node --test supabase/functions/
```

## In der Cloud einrichten

1. Auf https://supabase.com ein Projekt anlegen (Region z. B. Frankfurt, Free Tier). Die **Project Ref** steht in der URL des Dashboards.
2. CLI anmelden und verknüpfen:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```
3. Schema einspielen:
   ```bash
   npx supabase db push
   ```
4. Secret setzen und Funktion deployen:
   ```bash
   npx supabase secrets set INGEST_SECRET=$(openssl rand -hex 32)
   npx supabase functions deploy ingest --no-verify-jwt
   ```
   Den Secret-Wert vorher notieren (oder ihn erst erzeugen, notieren und dann setzen) – er kommt später in die ESPHome-`secrets.yaml`.
5. Im Dashboard unter **Authentication → Sign In / Providers** die Registrierung neuer Nutzer deaktivieren und unter **Authentication → Users** deinen einen Nutzer anlegen. Wichtig: Jeder angemeldete Nutzer hat Vollzugriff auf alle Daten.
6. Test gegen die Cloud:
   ```bash
   curl -i -X POST https://<project-ref>.supabase.co/functions/v1/ingest \
     -H "x-device-secret: <INGEST_SECRET>" \
     -H "Content-Type: application/json" \
     -d @supabase/functions/ingest/example.json
   ```
   Danach im Table Editor die zwei Test-Sensoren wieder löschen (die Readings werden mitgelöscht).
