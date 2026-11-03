# /// script
# requires-python = ">=3.10"
# dependencies = ["bleak>=0.22"]
# ///
"""Stand-in for the Atom Lite while it isn't set up: listens to Flower Care advertisements on the Mac
and posts them to Supabase `ingest` in the same format as the firmware (see plant_ble.h).

    uv run firmware/mac-bridge.py            # send every 10 min, like the firmware
    uv run firmware/mac-bridge.py --dry-run  # only show what was received
    python3 firmware/mac-bridge.py --selftest

The secret comes from firmware/secrets.yaml (ingest_secret), else from the INGEST_SECRET environment variable.
macOS hides BLE MAC addresses, so the MAC is taken from the MiBeacon payload, which the Flower Care includes.
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

MIBEACON_UUID = "0000fe95-0000-1000-8000-00805f9b34fb"
PRODUCT_HHCCJCY01 = 0x0098
DEFAULT_URL = "https://zvymcgkkjrfxqoartwrp.supabase.co/functions/v1/ingest"
SECRETS = Path(__file__).with_name("secrets.yaml")


def parse_mibeacon(d: bytes):
    """(mac, values) for an unencrypted Flower Care frame, else None. Mirrors plant_ble::parse_mibeacon."""
    if len(d) < 11:
        return None
    frame_control = d[0] | d[1] << 8
    has_object = frame_control & 0x0040
    has_capability = frame_control & 0x0020
    encrypted = frame_control & 0x0008
    product = d[2] | d[3] << 8
    if product != PRODUCT_HHCCJCY01 or not has_object or encrypted:
        return None
    mac = ":".join(f"{b:02X}" for b in reversed(d[5:11]))
    values = {}
    pos = 12 if has_capability else 11
    while pos + 3 <= len(d):
        typ = d[pos] | d[pos + 1] << 8
        vlen = d[pos + 2]
        v = d[pos + 3 : pos + 3 + vlen]
        if vlen < 1 or vlen > 4 or len(v) < vlen:
            break
        if typ == 0x1004 and vlen == 2:
            values["temperature"] = int.from_bytes(v, "little", signed=True) / 10
        elif typ == 0x1007 and vlen == 3:
            values["light"] = int.from_bytes(v, "little")
        elif typ == 0x1008 and vlen == 1:
            values["moisture"] = v[0]
        elif typ == 0x1009 and vlen == 2:
            values["conductivity"] = int.from_bytes(v, "little")
        elif typ == 0x100A and vlen == 1:
            values["battery"] = v[0]
        pos += 3 + vlen
    return (mac, values) if values else None


def read_secret() -> tuple[str, str]:
    url, secret = DEFAULT_URL, ""
    if SECRETS.exists():
        text = SECRETS.read_text()
        if m := re.search(r'^ingest_url:\s*"?([^"\n]+)"?', text, re.M):
            url = m.group(1).strip()
        if m := re.search(r'^ingest_secret:\s*"?([^"\n]+)"?', text, re.M):
            secret = m.group(1).strip()
    if secret in ("", "..."):
        # environment variable as fallback, ignoring empty values and the placeholder
        secret = os.environ.get("INGEST_SECRET", "").strip()
    if secret in ("", "..."):
        where = f"{SECRETS} ({'vorhanden' if SECRETS.exists() else 'fehlt'})"
        sys.exit(f"Kein Secret gefunden. Gesucht in {where} und in INGEST_SECRET.")
    return url, secret


def post(url: str, secret: str, readings: list[dict]) -> str:
    req = urllib.request.Request(
        url,
        data=json.dumps({"readings": readings}).encode(),
        headers={"Content-Type": "application/json", "x-device-secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return f"HTTP {res.status} {res.read().decode()}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code} {e.read().decode()}"


async def run(interval: int, dry_run: bool):
    from bleak import BleakScanner  # only needed for scanning, not for --selftest

    url, secret = (DEFAULT_URL, "") if dry_run else read_secret()
    fresh: dict[str, dict] = {}

    def on_advert(_device, adv):
        data = adv.service_data.get(MIBEACON_UUID)
        parsed = parse_mibeacon(bytes(data)) if data else None
        if not parsed:
            return
        mac, values = parsed
        r = fresh.setdefault(mac, {"mac": mac, "type": "flower_care"})
        r.update(values, rssi=adv.rssi)
        print(f"{time.strftime('%H:%M:%S')}  {mac}  {values}  ({adv.rssi} dBm)", flush=True)

    print("Starte Bluetooth … (beim ersten Mal fragt macOS nach der Bluetooth-Erlaubnis fürs Terminal)")
    while True:
        # After the Mac slept, CoreBluetooth stops delivering adverts without an error, so the scanner
        # is recreated whenever a whole interval passed without anything received.
        async with BleakScanner(on_advert):
            print("Suche Flower Care … (Strg+C beendet). Werte kommen einzeln, etwa alle paar Sekunden je Sensor.", flush=True)
            while True:
                await asyncio.sleep(interval)
                if not fresh:
                    print("– nichts empfangen (Ruhezustand? Sensor zu weit weg?); starte Bluetooth neu", flush=True)
                    break
                readings = list(fresh.values())
                fresh.clear()
                if dry_run:
                    print("würde senden:", json.dumps(readings))
                else:
                    print(f"sende {len(readings)} Sensor(en): {post(url, secret, readings)}", flush=True)


def selftest():
    # moisture 47 % from MAC C4:7C:8D:6A:12:34, as sent by a Flower Care
    frame = bytes.fromhex("7120980042" + "34126a8d7cc4" + "0d" + "081001" + "2f")
    assert parse_mibeacon(frame) == ("C4:7C:8D:6A:12:34", {"moisture": 47}), parse_mibeacon(frame)
    temp = bytes.fromhex("7120980042" + "34126a8d7cc4" + "0d" + "041002" + "d600")
    assert parse_mibeacon(temp)[1] == {"temperature": 21.4}
    light = bytes.fromhex("7120980042" + "34126a8d7cc4" + "0d" + "071003" + "520300")
    assert parse_mibeacon(light)[1] == {"light": 850}
    encrypted = bytes.fromhex("7928980042" + "34126a8d7cc4" + "0d" + "081001" + "2f")
    assert parse_mibeacon(encrypted) is None
    print("selftest ok")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--interval", type=int, default=600, help="Sekunden zwischen zwei Sendungen (Standard 600, wie die Firmware)")
    p.add_argument("--dry-run", action="store_true", help="nur anzeigen, nichts senden")
    p.add_argument("--selftest", action="store_true")
    a = p.parse_args()
    if a.selftest:
        selftest()
    else:
        try:
            asyncio.run(run(a.interval, a.dry_run))
        except KeyboardInterrupt:
            pass
