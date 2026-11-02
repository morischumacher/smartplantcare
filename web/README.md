# Web-App

Next.js 16 (App Router, Cache Components, Turbopack) als PWA. Läuft auf Vercel und liest und schreibt alles über Supabase als angemeldeter Nutzer (RLS).

## Seiten

| Pfad | Inhalt |
| --- | --- |
| `/` | Übersicht nach Räumen: Raumklima, Mini-Karte, Pflanzenkarten mit Feuchte, Status und To-dos |
| `/plants/[id]` | Verlauf (Feuchte mit Zielbereich, Temperatur, Licht; 7 oder 30 Tage), Gießen eintragen, erkanntes Gießen bestätigen, Hinweise, Gelerntes, Foto-Tagebuch mit KI-Check, Gießprotokoll |
| `/plants/new`, `/plants/[id]/settings` | Pflanze anlegen/bearbeiten, Sensoren zuordnen, Umtopfen, Archivieren |
| `/rooms/[id]` | Raumkarte: Raumfotos hochladen → KI-Grundriss (`plan-room`) → anpassen und speichern. Pins in Statusfarbe, Lichthof nach Helligkeit, Tooltip mit To-dos und Abstand zu Fenster/Heizung |
| `/settings` | Räume mit Hygrometer, Sensoren, Urlaub |
| `/login` | Anmelden (E-Mail + Passwort, Nutzer im Supabase-Dashboard anlegen) |

## Aufbau

- `src/lib/data.ts`: Lesen (Server Components, immer in `<Suspense>`). `summary` wird per Edge Function mit dem Token des Nutzers geholt.
- `src/app/actions.ts`: alle Schreibzugriffe als Server Actions, danach `refresh()`.
- `src/proxy.ts`: hält die Supabase-Session frisch und leitet ohne Login auf `/login`.
- Fotos werden im Browser auf max. 1600 px verkleinert und direkt in den Bucket `plant-photos` geladen.

## Lokal starten

```bash
cp .env.example .env.local   # Publishable Key aus Supabase → Project Settings → API Keys eintragen
npm install
npm run dev
```

## Vercel

Projekt aus dem GitHub-Repo importieren, **Root Directory** `web`, Umgebungsvariablen `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` setzen.
