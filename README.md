# Smart Plant Care

My own IoT system for looking after my houseplants, in daily use. Sensors in each pot measure soil moisture, light, temperature and humidity; the system learns how each plant reacts to watering and forecasts when it needs water next.

**Demo (2 min):** sensors, dashboard, room plan, how it learns from watering, and what it costs.

[![Smart Plant Care demo video](docs/demo/smartplantcare-demo.jpg)](docs/demo/smartplantcare-demo.mp4)

## What it does

- End to end: BLE sensors → ESP32 gateway (M5Stack Atom Lite, ESPHome) → Supabase (EU) → web app, iPhone widget and Garmin watch.
- Learns per plant how much water raises the moisture by one percentage point and how fast the pot dries out, separately for each season.
- Photo diary with a health check through the Claude API.
- Push notifications for watering, humidity and sensor failures; automatic winter dormancy; holiday mode.
- Runs entirely on the Supabase free tier, without a server of my own.

## My role

Solo project: idea, hardware, firmware, backend, web app, iPhone widget and Garmin app.

## Tech stack

ESPHome / C++, Supabase (PostgreSQL, Edge Functions in TypeScript, pg_cron, Row Level Security), Next.js as a PWA on Vercel, Scriptable (JavaScript), Garmin Connect IQ (Monkey C), ntfy

## Architecture

```
Flower Care (HHCCJCY01) ─┐
Govee H5075 ─────────────┼─ BLE ─▶ Atom Lite / ESPHome ─ HTTPS ─▶ Supabase Edge Function `ingest`
                         ┘                                              │
                                                              Postgres (readings, plants, …)
                                                                        │
                       Edge Function `summary` (read-only) ◀────────────┤
                          │                                             │
            iPhone widget, Garmin glance                  Web app (PWA) · push via ntfy
```

## Folders

| Folder | Contents |
| --- | --- |
| `firmware/` | ESPHome configuration for the gateway |
| `backend/` | Supabase: migrations and Edge Functions |
| `web/` | Web app (Next.js) |
| `scriptable/` | iPhone widget |
| `garmin/` | Connect IQ app for the Forerunner 165 |

The full project plan (in German) is in [PLAN.md](PLAN.md).
