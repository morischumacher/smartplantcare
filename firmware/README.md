# Firmware (ESPHome auf dem M5Stack Atom Lite)

Der Atom Lite hört passiv auf Bluetooth-Advertisements aller **Flower Care (HHCCJCY01)** und **Govee H5075** in Reichweite, sammelt die Werte und schickt sie alle 10 Minuten per HTTPS an die Supabase-Funktion `ingest`.

Sensoren werden **automatisch erkannt** – es stehen keine MAC-Adressen in der Konfiguration. Ein neuer Sensor erscheint nach spätestens ein paar Minuten in der Tabelle `sensors` in Supabase. Für weitere Pflanzen muss die Firmware nicht neu geflasht werden.

| Datei | Inhalt |
| --- | --- |
| `plant-gateway.yaml` | ESPHome-Konfiguration |
| `plant_ble.h` | Auswertung der BLE-Daten (Flower Care „MiBeacon“, Govee H5075) und JSON-Aufbau |
| `secrets.yaml.example` | Vorlage für WLAN-Daten und Secrets |
| `test/` | Unit-Tests für `plant_ble.h`, laufen am Mac ohne Hardware |

## Einmalig: ESPHome installieren

```bash
uv tool install esphome
```

(`uv` ist bei dir schon installiert. Alternativ `pip install esphome`.)

## Secrets anlegen

```bash
cd firmware
cp secrets.yaml.example secrets.yaml
```

In `secrets.yaml` eintragen:
- `wifi_ssid` / `wifi_password`: dein WLAN (2,4 GHz – der ESP32 kann kein 5 GHz)
- `fallback_ap_password`: beliebig, mind. 8 Zeichen
- `ota_password`: z. B. `openssl rand -hex 16`
- `ingest_secret`: derselbe Wert wie `INGEST_SECRET` in Supabase

`secrets.yaml` ist in `.gitignore` und landet nicht im Repo.

## Ohne Atom Lite testen: der Mac als Gateway

[`mac-bridge.py`](mac-bridge.py) hört am Mac auf die Flower Care und schickt die Werte im selben Format wie die Firmware an `ingest`. Gut, um Sensoren und Web-App zu testen, bevor der Atom Lite läuft. Braucht `ingest_secret` in `secrets.yaml` (siehe oben).

```bash
uv run firmware/mac-bridge.py --dry-run   # nur anzeigen, was ankommt
uv run firmware/mac-bridge.py             # alle 10 Minuten an Supabase senden
```

Beim ersten Start fragt macOS nach der Bluetooth-Erlaubnis für das Terminal. Die Sensoren müssen in Bluetooth-Reichweite des Mac sein (wenige Meter).

Solange das Skript läuft, verhindert es den Ruhezustand (`caffeinate`). Wird der Deckel zugeklappt, schläft der Mac trotzdem, und es kommen keine Werte an. Danach startet das Skript Bluetooth von selbst neu, sobald 10 Minuten lang nichts empfangen wurde.

## Erstes Flashen (per USB-C)

1. Atom Lite per USB-C-**Datenkabel** an den Mac (reine Ladekabel funktionieren nicht).
2. Flashen und direkt die Logs anzeigen:
   ```bash
   esphome run plant-gateway.yaml
   ```
   Beim ersten Mal dauert das Kompilieren einige Minuten. Bei der Frage nach dem Gerät den USB-Port wählen (z. B. `/dev/cu.usbserial-…`).
3. Erscheint kein USB-Port: Der Atom Lite nutzt einen CH9102-USB-Chip. Dann den Treiber von WCH installieren und es erneut versuchen.

## Spätere Updates (über WLAN)

Sobald der Atom Lite im WLAN ist, geht alles ohne Kabel:

```bash
esphome run plant-gateway.yaml      # bei der Gerätefrage "plant-gateway.local" (OTA) wählen
esphome logs plant-gateway.yaml     # nur Logs ansehen
```

## Prüfen, ob alles läuft

In den Logs erscheint alle 10 Minuten (sobald Sensoren in Reichweite sind):

```
[I][main]: ingest: HTTP 200 {"inserted":3,"errors":[]}
```

| Log | Bedeutung |
| --- | --- |
| `HTTP 200` | alles gut, Daten sind in Supabase |
| `HTTP 401` | `ingest_secret` stimmt nicht mit `INGEST_SECRET` in Supabase überein |
| `HTTP 400` mit `errors` | Werte wurden abgelehnt – die Meldung sagt, welche |
| `request failed` | keine Verbindung (WLAN, DNS, Zertifikat) |
| keine Zeile | in den letzten 10 Minuten kein Sensor empfangen |

Danach in Supabase unter **Table Editor → `sensor_latest`** nachsehen.

## Sensoren zuordnen

Neue Sensoren tauchen in `sensors` ohne Namen und Raum auf. Um herauszufinden, welche MAC zu welcher Pflanze gehört:
- die MAC in der Flower-Care- bzw. WatchFlower-App ablesen, oder
- die Sensoren nacheinander in Betrieb nehmen (Batterie rein) und jeweils schauen, welche MAC neu dazukommt.

Dann in `sensors` Name und Raum eintragen und den Sensor in `plant_sensors` einer Pflanze zuordnen. Später übernimmt das die Web-App.

Hinweis: Auch Sensoren von Nachbarn in Funkreichweite werden angelegt. Sie stören nicht, solange sie keiner Pflanze zugeordnet sind – du kannst sie einfach löschen.

## Tests

```bash
firmware/test/run.sh
```

Prüft die Auswertung der Flower-Care- und Govee-Daten, das Zusammenführen der Werte pro Sensor und das JSON-Format.

## Bekannte Grenzen

- Schlägt ein Upload fehl, gehen die Werte dieses 5-Minuten-Fensters verloren (beim nächsten Mal kommen neue).
- Flower Care mit Firmware 3.2.1+ meldet keinen Batteriestand mehr.
- Es werden nur unverschlüsselte MiBeacon-Daten gelesen. Das ist beim HHCCJCY01 Standard; die MAX-Version (HHCCJCY09) wird nicht unterstützt.
