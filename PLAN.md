# Smart Plant Monitor – Projektplan für Claude Code

Dieses Dokument ist der Startpunkt für die Umsetzung mit Claude Code. Ziel: Ein eigenes System zur Pflanzenüberwachung mit Web-App (Laptop + Handy), iPhone-Widget (Scriptable) und Garmin-Glance (Forerunner 165).

## Hardware (Stand: bestellt/geplant)

- **Gateway:** M5Stack Atom Lite (ESP32, Modell C008), per USB-C am Netzteil
- **Pflanzensensor:** Xiaomi/HHCC Flower Care, Modell **HHCCJCY01** (Bluetooth LE; misst Bodenfeuchte %, Temperatur °C, Licht lux, Leitfähigkeit µS/cm)
- **Raumklima:** Govee H5075 (Bluetooth LE; Temperatur + Luftfeuchtigkeit)
- Später erweiterbar: weitere Flower-Care-Sensoren, weitere Hygrometer (1 pro Raum), ggf. zweiter Atom Lite für andere Räume

## Einkaufsliste

Alles für den Start mit 5 Pflanzen in einem Raum plus automatischer Luftbefeuchtung.

| Produkt | Anzahl | Zweck | ca. Preis |
| --- | --- | --- | --- |
| HHCC Flower Care, Modell HHCCJCY01 | 5 | Pflanzensensor (Bodenfeuchte, Licht, Temperatur, Nährstoffe) | 13–20 € pro Stück gebraucht/neu |
| M5Stack Atom Lite (C008) | 1 | Bluetooth-zu-WLAN-Gateway | 10 € gebraucht, 15 € neu |
| Govee H5075 | 1 pro Raum | Thermo-Hygrometer (Bluetooth) | 10–13 € |
| Shelly Plug S Gen3 | 1 | Smarte Steckdose für den Luftbefeuchter | ab ca. 14 € |
| Boneco W200 | 1 | Luftbefeuchter (Verdunster, Drehschalter) | Preis vor dem Kauf prüfen |
| USB-C-Kabel + USB-Netzteil | 1 | Stromversorgung Atom Lite | oft vorhanden, sonst ca. 10 € |
| CR2032-Knopfzellen | 5 als Reserve | Ersatzbatterien für Flower Care | ca. 5 € |

Beim Kauf der Flower Care auf die Modellnummer HHCCJCY01 achten (nicht die MAX-Version HHCCJCY09). Bei Pflanzen in mehreren Räumen kann ein zweiter Atom Lite nötig sein.

## Architektur

Flower Care + Govee H5075 → (BLE-Advertisements) → Atom Lite / ESPHome → (HTTPS POST) → Supabase (Postgres + REST + Edge Functions) → Web-App, Scriptable-Widget, Garmin-Glance. Push-Benachrichtigungen über ntfy.

Grundsätze:

- Kein Homeserver nötig, alles läuft über Supabase (Free Tier).
- Ein gemeinsames Backend als einzige Datenquelle für alle Clients.
- Clients lesen über einen schlanken, read-only API-Endpunkt ("summary"), damit Scriptable und Garmin wenig Logik brauchen.

## Komponenten

### 1. Firmware (ESPHome auf Atom Lite)

- ESPHome-Konfiguration mit `esp32_ble_tracker`
- Flower Care über `xiaomi_hhccjcy01` (passiv, schont die Batterie)
- Govee H5075 über passendes ESPHome-Parsing bzw. Community-Komponente (prüfen, welche aktuell gepflegt ist)
- Werte alle ca. 5–10 Minuten per `http_request` als JSON an eine Supabase Edge Function senden (Auth über ein Geräte-Secret im Header)
- Hinweis: Neuere HHCCJCY01-Firmware (3.2.1) sendet keinen Batteriestand mehr
- Flashen über ESPHome Web oder ESPHome CLI am Laptop

### 2. Backend (Supabase)

Tabellen (Vorschlag):

- `sensors` – id, mac, typ (flower\_care / hygrometer), name, raum
- `plants` – id, name, sensor\_id(s), topfvolumen\_l, ziel\_feuchte\_min, ziel\_feuchte\_max, notizen
- `readings` – id, sensor\_id, ts, moisture, temperature, light, conductivity, humidity
- `waterings` – id, plant\_id, ts, menge\_ml, feuchte\_vorher, feuchte\_nachher

Edge Functions:

- `ingest` – nimmt Messwerte vom Atom Lite an (Secret prüfen)
- `summary` – liefert kompaktes JSON pro Pflanze: aktuelle Werte, Status (ok / bald gießen / jetzt gießen), empfohlene Wassermenge, geschätzter nächster Gießzeitpunkt
- `notify` (zeitgesteuert) – schickt Push über ntfy, wenn eine Pflanze unter die Zielfeuchte fällt

Sicherheit: Row Level Security aktiv; `summary` nur mit eigenem Read-Token.

### 3. Gieß-Logik

- **Startwert über Topfgröße:** Wassermenge ≈ Topfvolumen × (Zielfeuchte − aktuelle Feuchte) × Speicherfaktor (Startwert ca. 0,3–0,5)
- **Lernfunktion:** Nach jedem eingetragenen Gießen ml pro Prozentpunkt Feuchteanstieg berechnen und als gleitenden Mittelwert pro Pflanze speichern; danach diesen Wert statt der Formel verwenden
- **Prognose:** Aus dem Feuchteabfall der letzten Tage den nächsten Gießzeitpunkt schätzen
- Mehrere Sensoren pro Pflanze möglich (große Töpfe), Werte werden gemittelt

### 3a. Lernen aus dem Gießen (Kernfunktion)

Die App lernt pro Pflanze, wie viel Wasser welche Wirkung hat.

- Bei jedem Gießen: Menge in ml eintragen; die App speichert Feuchte vorher, Spitzenwert danach und den Verlauf der folgenden Tage
- Daraus pro Pflanze: ml pro Prozentpunkt Feuchteanstieg, Austrocknungsrate pro Tag, Zeit bis zum nächsten Gießen
- Erkennen von Übergießen (Feuchte bleibt lange über dem Zielbereich) und Untergießen (Feuchte fällt schnell wieder ab)
- Empfehlung wird mit jedem Gießen genauer; Anzeige, wie sicher die Empfehlung ist (z. B. "auf Basis von 5 Gießvorgängen")

### 3b. Pflanzen, Räume und Raumklima

- Pro Pflanze einstellbar: Name, Pflanzenart, Topfgröße (Durchmesser/Höhe oder Liter), Raum, zugeordnete Sensoren, Zielbereiche (Feuchte, Licht, Temperatur, Luftfeuchte)
- Räume als eigene Einheit: jeder Raum hat ein Hygrometer (z. B. Govee H5075); alle Pflanzen eines Raums werden gruppiert und teilen dessen Luftfeuchte- und Temperaturwerte
- Ansicht nach Raum gruppiert: Raumklima oben, darunter die Pflanzen des Raums
- Optional: Pflanzendatenbank bzw. Vorlagen mit typischen Zielwerten je Art

### 3c. Umfassende Hinweise

Die App soll aktiv informieren, nicht nur Werte anzeigen.

- Gießen: "Monstera bitte ca. 250 ml gießen" sowie Vorwarnung "in ca. 2 Tagen gießen"
- Luftfeuchte zu niedrig: Hinweis zum Befeuchten (Pflanzen besprühen, Luftbefeuchter, Wasserschale); im Winter möglichst kurz stoßlüften, da lange Fensterlüftung die Luft weiter austrocknet
- Luftfeuchte zu hoch: Hinweis "bitte lüften" (Schimmel- und Fäulnisgefahr)
- Temperatur: Warnung bei Kälte (z. B. unter 12 °C am Fenster) oder Hitze
- Licht: Hinweis, wenn eine Pflanze dauerhaft zu wenig oder zu viel Licht bekommt (Standort ändern)
- Nährstoffe: Düngeerinnerung bei niedriger Leitfähigkeit
- Technik: Sensor sendet nicht mehr, Batterie schwach
- Alle Hinweise in der Web-App, als Push (ntfy) und damit auch auf der Garmin; Ruhezeiten einstellbar

### 3d. Jahreszeit und Temperatur

Zielwerte und Empfehlungen passen sich der Jahreszeit an.

- Winterruhe wird automatisch erkannt: je nach Pflanzenart (aus der Pflanzendatenbank) und aktuellem Datum, unterstützt durch Messwerte wie sinkendes Tageslicht und langsameres Austrocknen; keine manuelle Einstellung nötig
- Winter: weniger gießen und nicht düngen, niedrigere Zielfeuchte, Hinweis bei Heizungsluft (niedrige Luftfeuchte) und kalter Zugluft am Fenster
- Frühling/Sommer: Wachstumsphase, mehr Wasser, Düngeerinnerungen, Warnung vor praller Mittagssonne und Hitze
- Herbst: Hinweis, Balkonpflanzen bei sinkenden Nachttemperaturen hereinzuholen
- Temperatur-Zielbereich pro Pflanzenart, getrennt nach Tag und Nacht
- Die Lernfunktion speichert Werte pro Jahreszeit, da der Wasserbedarf im Sommer deutlich höher ist

### 3e. Urlaubsmodus

Im Urlaub plant die App vorausschauend und informiert anders.

- Urlaub mit Start- und Enddatum einstellen
- Vor der Abreise: Hinweis, welche Pflanzen wie viel extra gießen sollten, damit sie durchhalten (aus der gelernten Austrocknungsrate)
- Warnung, wenn eine Pflanze die Urlaubsdauer voraussichtlich nicht schafft, mit Tipps (Schatten, Wasserspeicher, Gießhilfe)
- Während des Urlaubs: keine normalen Gieß-Erinnerungen, nur kritische Warnungen
- Optional: Hinweise an eine Vertretung, z. B. Nachbarin mit Link auf eine einfache Gieß-Liste
- Gießdaten im Urlaub werden nicht als Lernwerte gewertet

### 3f. Ausbau: Automatische Luftbefeuchtung

Das System schaltet einen Luftbefeuchter pro Raum selbst ein und aus, gesteuert vom Raum-Hygrometer.

- Steuerung über eine smarte WLAN-Steckdose, lokal ohne Hersteller-Cloud (Shelly hat eine lokale HTTP-API)
- Luftbefeuchter mit mechanischem Schalter, damit er nach Stromzufuhr sofort wieder läuft
- Regel mit Hysterese: z. B. ein unter 40 %, aus über 50 % (Zielbereich pro Raum einstellbar, an die Pflanzen angepasst)
- Schutz: Mindestlaufzeit und Pausen, Abschaltung bei Sensor-Ausfall, Hinweis "Wassertank leer" über den Stromverbrauch der Steckdose
- Manueller Override in der Web-App sowie Abschaltung im Urlaubsmodus (Tank würde leerlaufen)

Produktempfehlungen:

| Produkt | Zweck | ca. Preis |
| --- | --- | --- |
| [Shelly Plug S Gen3](https://geizhals.at/shelly-plug-s-gen3-a3310522.html) | Smarte Steckdose, WLAN, lokal schaltbar, mit Strommessung | ab ca. 14 € |
| Luftbefeuchter mit Drehregler/Kippschalter (Ultraschall oder Verdunster) | Läuft an, sobald die Steckdose Strom gibt | ca. 30–80 € |
| Alternativ: Govee Smart-Luftbefeuchter | Über die Govee-Cloud-API steuerbar, keine Steckdose nötig | ca. 40–70 € |

Hinweis: Verdunster-Luftbefeuchter hinterlassen keinen weißen Kalkstaub wie Ultraschallgeräte; bei Ultraschall destilliertes oder gefiltertes Wasser verwenden. Preise der Luftbefeuchter sind grobe Richtwerte.

### 4. Web-App (Laptop + Handy)

- Responsive Web-App, z. B. Next.js oder SvelteKit, Deployment auf Vercel
- Als PWA installierbar (Homescreen-Icon am iPhone)
- Ansichten: Übersicht aller Pflanzen mit Status-Ampel; Detailseite mit Verlaufsgrafiken (Feuchte, Licht, Temperatur, Luftfeuchte); Button "Gegossen" mit Mengeneingabe; Einstellungen pro Pflanze (Topfgröße, Zielbereich, Sensorzuordnung)
- Login über Supabase Auth (nur ein Nutzer)

### 5. iPhone-Widget (Scriptable)

- JavaScript-Skript in der App Scriptable, ruft `summary` auf
- Klein: wichtigste Pflanze bzw. "x Pflanzen brauchen Wasser"
- Mittel: Liste mit Name, Feuchte %, Status
- Optional Sperrbildschirm-Widget
- Tippen öffnet die Web-App

### 6. Garmin-Glance (Forerunner 165)

- Connect IQ SDK, Sprache Monkey C, Entwicklung in VS Code mit Garmin-Extension
- Glance zeigt z. B. "2 Pflanzen gießen" bzw. die kritischste Pflanze mit Feuchte %
- Detailansicht beim Öffnen: Liste der Pflanzen mit Status
- Datenabruf über `Communications.makeWebRequest` (läuft über das gekoppelte iPhone) auf `summary`
- Nur Sideload für den Eigengebrauch, keine Store-Veröffentlichung nötig
- Vor Start prüfen: Forerunner 165 im SDK als Zielgerät, Speicher- und Glance-Limits

### 7. Benachrichtigungen

- ntfy (kostenlos) mit App am iPhone; Benachrichtigungen erscheinen automatisch auch auf der Garmin
- Beispiel: "Monstera: 18 % – bitte ca. 250 ml gießen"

## Reihenfolge der Umsetzung

1. Supabase-Projekt anlegen, Schema + `ingest`-Funktion
2. ESPHome auf den Atom Lite flashen, Sensoren erkennen, Daten in Supabase sehen
3. `summary`-Endpunkt + Gieß-Logik (erst Formel, dann Lernfunktion)
4. Web-App: Übersicht, Details, "Gegossen"-Button
5. ntfy-Benachrichtigungen
6. Scriptable-Widget
7. Garmin-Glance

## Offene Punkte

- Govee H5075: gepflegte ESPHome-Komponente bzw. Advertisement-Format bestätigen
- Flower Care vor dem Einsatz mit Flower-Care- oder WatchFlower-App testen
- Pflanzennamen, Topfgrößen und Räume sammeln
- Framework-Wahl für die Web-App final festlegen

## Prompt-Vorschlag für Claude Code

Ich baue ein Pflanzen-Monitoring-System nach dem beiliegenden Plan. Starte mit Schritt 1: Lege ein Supabase-Schema für sensors, plants, readings und waterings an und schreibe eine Edge Function `ingest`, die Messwerte per POST mit Geräte-Secret annimmt. Erkläre mir danach, wie ich das Projekt einrichte und teste.

## Übergabe an Claude Code

So startest du das Projekt mit Claude Code.

1. Projektordner anlegen, z. B. `plant-monitor`, und Claude Code darin starten
2. Dieses Dokument als `PLAN.md` in den Ordner legen (Export als Markdown) und Claude Code bitten, daraus eine `CLAUDE.md` mit Projektzielen, Architektur und Konventionen zu machen
3. Accounts bereithalten: Supabase, Vercel, ntfy-App am iPhone, später Garmin-Developer-Account
4. Schritt für Schritt nach "Reihenfolge der Umsetzung" vorgehen; nach jedem Schritt testen, dann committen (Git)
5. Sobald Atom Lite und Sensor da sind: ESPHome-Schritt mit echter Hardware testen; MAC-Adressen der Sensoren notieren

Erster Prompt für Claude Code:

```
Lies PLAN.md. Das ist mein Projekt: ein Pflanzen-Monitoring-System mit ESPHome-Gateway (M5Stack Atom Lite), Flower-Care-Sensoren (HHCCJCY01), Govee-H5075-Hygrometern, Supabase-Backend, Web-App (PWA auf Vercel), Scriptable-Widget und Garmin-Glance (Forerunner 165).

Wichtig sind mir: Lernen aus dem Gießen, Pflanzen mit Topfgröße und Raum, Gruppierung pro Raum mit Hygrometer, Hinweise zu Gießen, Luftfeuchte, Lüften, Temperatur, Licht und Dünger, automatische Winterruhe je nach Pflanzenart und Jahreszeit sowie ein Urlaubsmodus.

1. Erstelle zuerst eine CLAUDE.md und eine Ordnerstruktur für firmware, backend, web, scriptable und garmin.
2. Dann Schritt 1: Supabase-Schema (sensors, rooms, plants, readings, waterings, vacations) und die Edge Function ingest.
3. Erkläre mir danach, wie ich das einrichte und teste. Frag nach, bevor du größere Entscheidungen triffst.
```
