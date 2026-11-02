# Backend (Supabase)

Postgres-Schema und Edge Functions. Die Supabase-CLI läuft über `npx`, eine globale Installation ist nicht nötig. Alle Befehle im Ordner `backend/` ausführen.

## Datenmodell

| Tabelle | Inhalt |
| --- | --- |
| `rooms` | Raum mit Zielbereich Luftfeuchte |
| `sensors` | BLE-Sensor (MAC, Typ `flower_care` / `hygrometer`, Raum, zuletzt gesehen, Batterie, RSSI) |
| `plants` | Pflanze mit Art, Raum, Topfgröße und Zielbereichen (Feuchte, Licht, Temperatur, Leitfähigkeit) |
| `plant_sensors` | Zuordnung Pflanze ↔ Sensor(en), mehrere Sensoren pro Topf möglich |
| `readings` | Rohmesswerte pro Sensor |
| `waterings` | Gießvorgänge (ml, Feuchte vorher/Spitze, Urlaub ja/nein) |
| `vacations` | Urlaubszeiträume |
| `sensor_latest` (View) | jeweils letzter Messwert pro Sensor |

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

Unit-Tests der Validierung (ohne Docker):

```bash
node --test supabase/functions/ingest/
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
