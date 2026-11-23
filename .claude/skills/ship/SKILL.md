---
name: ship
description: Testet die geänderten Teile des Projekts, committet und pusht auf main (löst Deploy von Supabase und Vercel aus). Nutzen, wenn ein Umsetzungsschritt fertig ist oder der Nutzer "ship", "commit", "push" oder "raus damit" sagt.
---

# Ship

Bringt den aktuellen Stand sicher raus: nur testen, was sich geändert hat, dann committen und pushen. Nicht nachfragen, solange alles grün ist.

## 1. Was hat sich geändert?

```bash
git status --short
git diff --stat HEAD
```

Nichts geändert → melden „Nichts zu shippen“ und aufhören.

Prüfen, dass keine Secrets dabei sind (`.env`, `secrets.yaml`, Tokens, Keys im Diff). Wenn doch: nicht committen, Nutzer warnen.

## 2. Nur die betroffenen Teile testen

| Geänderter Pfad | Befehl |
| --- | --- |
| `backend/` | `cd backend && node --test supabase/functions/` |
| `web/` | `cd web && npm run build && npm run lint && npm test` |
| `firmware/` | `cd firmware && test/run.sh` |
| `scriptable/` | `node --test scriptable/test/` |
| `garmin/` | keine automatischen Tests – im Commit erwähnen, dass eine neue `.iq` hochgeladen werden muss (siehe `garmin/README.md`) |
| nur Doku / `.claude/` | keine Tests nötig |

Befehle unabhängiger Bereiche dürfen parallel laufen.

**Test rot?** Fehler beheben und erneut testen. Wenn der Fehler nicht offensichtlich zur aktuellen Änderung gehört: stoppen, nichts committen, dem Nutzer den Fehler zeigen.

## 3. Extra-Checks

- Neue Datei in `backend/supabase/migrations/`? Sicherstellen, dass keine bereits deployte Migration verändert wurde (`git diff --name-status HEAD -- backend/supabase/migrations/` darf nur `A` zeigen). Sonst stoppen.
- Geänderte Edge Function oder Web-App: Nach dem Push wird automatisch deployt – im Abschluss erwähnen.

## 4. Committen

- Nur die zur Aufgabe gehörenden Dateien stagen (`git add <pfade>`), nicht blind `git add -A`.
- Commit-Nachricht auf Englisch im Stil der bisherigen Commits: kurze Betreffzeile (Was für den Nutzer anders ist), Leerzeile, Stichpunkte mit Details.
- Mit der Attributionszeile abschließen, die in der Session vorgegeben ist.

## 5. Pushen

```bash
git push
```

Auf einem anderen Branch als `main`: Branch pushen (`git push -u origin HEAD`) und anbieten, einen PR zu öffnen.

Push abgelehnt (Remote ist weiter): `git pull --rebase`, Tests erneut laufen lassen, dann pushen. Bei Konflikten stoppen und melden.

## 6. Abschluss

Eine kurze Meldung auf Deutsch: was getestet wurde (grün), Commit-Betreff, gepusht ja/nein, was deployt wird, und ob der Nutzer noch etwas tun muss (z. B. Garmin-Upload, Firmware per OTA flashen).
