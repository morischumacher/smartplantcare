# Garmin-Glance (Forerunner 165)

Connect-IQ-Widget in Monkey C, nur zum Sideload:

- **Glance** im Widget-Loop: „2 Pflanzen gießen“ und die dringendste Pflanze mit Feuchte.
- **Detailansicht** beim Öffnen: Liste mit Statuspunkt, Feuchte und bei „Gießen“ der Menge. Hoch/Runter blättert, Start lädt neu.
- Ein **Hintergrunddienst** holt alle 15 Minuten `summary?view=compact` über das gekoppelte iPhone. Glance und Liste lesen nur den Speicher, deshalb geht das auch ohne Verbindung.

| Datei | Inhalt |
| --- | --- |
| `source/PlantsApp.mc` | App, registriert den Hintergrunddienst, speichert dessen Daten |
| `source/PlantsService.mc` | Hintergrunddienst (`onTemporalEvent` → Abruf → `Background.exit`) |
| `source/PlantsData.mc` | Abruf, Kürzen der Antwort (max. ~8 KB für den Hintergrund), Texte und Farben |
| `source/PlantsGlance.mc`, `source/PlantsView.mc` | Glance und Liste |
| `source/Secrets.mc` | Read-Token (gitignored, Vorlage `Secrets.mc.example`) |

Sideload-Apps lassen sich nicht über Garmin Connect konfigurieren, deshalb wird das Token mit eingebaut.

## Bauen und aufspielen

1. [Connect IQ SDK Manager](https://developer.garmin.com/connect-iq/sdk/) installieren, mit dem Garmin-Konto anmelden, aktuelles SDK und das Gerät **Forerunner 165** laden. In VS Code die Erweiterung „Monkey C“ installieren.
2. Einmalig einen Entwicklerschlüssel erzeugen (bleibt außerhalb des Repos):

```bash
openssl genrsa -out ~/.garmin/developer_key.pem 4096 && openssl pkcs8 -topk8 -inform PEM -outform DER -in ~/.garmin/developer_key.pem -out ~/.garmin/developer_key.der -nocrypt
```

3. Der Compiler braucht Java. Ohne installiertes JDK reicht ein entpacktes [Temurin 21](https://adoptium.net/) unter `~/.garmin/jdk` (so auf dem Entwicklungs-Mac).
4. `cp source/Secrets.mc.example source/Secrets.mc` und das `SUMMARY_TOKEN` eintragen (siehe [Scriptable-README](../scriptable/README.md)).
5. Im Simulator testen: VS Code → „Monkey C: Run“ mit Gerät `fr165`. Im Simulator unter *Settings → Background Events* den Hintergrunddienst auslösen.
6. Für die Uhr bauen (Forerunner 165 Music: `fr165m`, ohne Music: `fr165`):

```bash
cd garmin && JAVA_HOME=~/.garmin/jdk/Contents/Home "$(ls -d ~/Library/Application\ Support/Garmin/ConnectIQ/Sdks/*/ | tail -1)bin/monkeyc" -f monkey.jungle -d fr165m -o bin/Pflanzen-fr165m.prg -y ~/.garmin/developer_key.der -l 2
```

Im Simulator laden: `connectiq` starten, dann `monkeydo bin/Pflanzen-fr165m.prg fr165m` (beides im `bin/` des SDK).

Die Uhr per USB anschließen und `bin/Pflanzen.prg` nach `GARMIN/APPS/` kopieren (am Mac mit [OpenMTP](https://openmtp.ganeshrvel.com/), da die Uhr als MTP-Gerät erscheint). Danach im Widget-Loop „Pflanzen“ hinzufügen.
