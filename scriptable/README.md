# iPhone-Widget (Scriptable)

[`Pflanzen.js`](Pflanzen.js) zeigt, welche Pflanzen Wasser brauchen. Es liest `summary?view=compact` mit dem Read-Token.

| Größe | Inhalt |
| --- | --- |
| klein | „2 Pflanzen gießen“, dringendste Pflanze mit Feuchte und Menge |
| mittel / groß | Liste (4 bzw. 10 Pflanzen) mit Status, Feuchte, bei „Gießen“ die Menge in ml |
| Sperrbildschirm | rund: Anzahl; rechteckig: Überschrift + 2 dringendste; Zeile: Überschrift |

Ohne Netz zeigt das Widget die letzte Antwort mit „offline“. Antippen öffnet die Web-App.

## Einrichten

1. [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) installieren.
2. In Scriptable ein neues Skript „Pflanzen“ anlegen und den Inhalt von `Pflanzen.js` hineinkopieren (oder die Datei in den Scriptable-Ordner in iCloud Drive legen).
3. Skript einmal starten: es fragt nach dem **Read-Token** (`SUMMARY_TOKEN`, siehe unten) und der Adresse der Web-App und speichert beides im Schlüsselbund. Danach bietet ein Start in der App Vorschauen und „Token / Adresse ändern“.
4. Auf dem Homescreen oder Sperrbildschirm ein Scriptable-Widget hinzufügen, gedrückt halten → „Widget bearbeiten“ → Script „Pflanzen“.

Das Read-Token ist das Secret `SUMMARY_TOKEN` der Edge Functions. Noch nicht gesetzt? Ein zufälliges erzeugen und setzen:

```bash
openssl rand -hex 24
```

```bash
cd backend && npx supabase secrets set SUMMARY_TOKEN=<token> --project-ref zvymcgkkjrfxqoartwrp
```

## Test

```bash
node --test scriptable/test/
```

rendert das Skript mit nachgebauter Scriptable-API für alle Größen, offline und ohne Token.
