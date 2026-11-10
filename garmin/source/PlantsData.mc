import Toybox.Application.Storage;
import Toybox.Communications;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;

// Loading and reading the summary. The compact view
//   { attention, alerts: [{ room, kind, severity, message }],
//     plants: [{ id, name, room, status, moisture, ml, next_h, hint }], rooms: [{ id, name, humidity, temperature, status }] }
// is stored slim: plants and rooms, each room with its most important climate alert.
// Plant and room details (`view=plant` / `view=room`) are only loaded when opened, never stored.
(:background :glance)
module PlantsData {
    const KEY = "summary";
    const URL = "https://zvymcgkkjrfxqoartwrp.supabase.co/functions/v1/summary";

    // "Gewächshaus" palette of the web app, slightly brighter for the black AMOLED screen
    const RED = 0xD0643F;
    const OCHRE = 0xD5A434;
    const GREEN = 0x4F9A68;
    const GREY = 0xA5A091;
    const BLUE = 0x7FA8C9;
    const TEXT = 0xF7F6F1;
    const DIM = 0x6B675C;
    const TRACK = 0x2E2C27;
    const BAND = 0x2A3D30;

    function fetch(callback as Method(responseCode as Number, data as Dictionary or String or Null) as Void) as Void {
        request({ "view" => "compact" }, callback);
    }

    // view: "plant" or "room"
    function fetchDetail(view as String, id as String, callback as Method(responseCode as Number, data as Dictionary or String or Null) as Void) as Void {
        request({ "view" => view, "id" => id }, callback);
    }

    function request(params as Dictionary, callback as Method(responseCode as Number, data as Dictionary or String or Null) as Void) as Void {
        Communications.makeWebRequest(
            URL,
            params,
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :headers => { "x-read-token" => Secrets.SUMMARY_TOKEN },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            callback
        );
    }

    function load() as Dictionary? {
        var data = Storage.getValue(KEY);
        return data instanceof Dictionary ? data : null;
    }

    function list(data as Dictionary?, key as String) as Array {
        if (data == null || !(data[key] instanceof Array)) {
            return [];
        }
        return data[key] as Array;
    }

    function plants(data as Dictionary?) as Array {
        return list(data, "plants");
    }

    function rooms(data as Dictionary?) as Array {
        return list(data, "rooms");
    }

    function countStatus(data as Dictionary?, status as String) as Number {
        var n = 0;
        var all = plants(data);
        for (var i = 0; i < all.size(); i++) {
            if (((all[i] as Dictionary)["status"] as String).equals(status)) {
                n++;
            }
        }
        return n;
    }

    // first room with a climate alert (alerts arrive critical first), or null
    function alertRoom(data as Dictionary?) as Dictionary? {
        var all = rooms(data);
        for (var i = 0; i < all.size(); i++) {
            if ((all[i] as Dictionary)["alert"] != null) {
                return all[i] as Dictionary;
            }
        }
        return null;
    }

    // "Luft zu trocken (31 %) – befeuchten" -> "Luft zu trocken"
    function alertTitle(room as Dictionary) as String {
        var text = room["alert"] as String;
        var i = text.find(" (");
        return (room["name"] as String) + ": " + (i == null ? text : text.substring(0, i));
    }

    // Most urgent first: water now, climate, water soon. Plants without a sensor don't count.
    function headline(data as Dictionary?) as String {
        if (data == null) {
            return "Keine Daten";
        }
        var now = countStatus(data, "water_now");
        if (now > 0) {
            return now == 1 ? firstName(data, "water_now") + " gießen" : now.toString() + " Pflanzen gießen";
        }
        var room = alertRoom(data);
        if (room != null) {
            return alertTitle(room);
        }
        var soon = countStatus(data, "water_soon");
        if (soon > 0) {
            return soon == 1 ? firstName(data, "water_soon") + " bald gießen" : soon.toString() + " bald gießen";
        }
        var all = plants(data);
        if (all.size() > 0 && countStatus(data, "no_data") == all.size()) {
            return "Keine Sensordaten";
        }
        return "Alles in Ordnung";
    }

    function firstName(data as Dictionary?, status as String) as String {
        var all = plants(data);
        for (var i = 0; i < all.size(); i++) {
            var p = all[i] as Dictionary;
            if ((p["status"] as String).equals(status)) {
                return p["name"] as String;
            }
        }
        return "";
    }

    // the plant due next (not already "water now"), or null
    function nextPlant(data as Dictionary?) as Dictionary? {
        var all = plants(data);
        var best = null;
        for (var i = 0; i < all.size(); i++) {
            var p = all[i] as Dictionary;
            var h = p["next_h"];
            if (h != null && !(p["status"] as String).equals("water_now")
                && (best == null || (h as Number) < ((best as Dictionary)["next_h"] as Number))) {
                best = p;
            }
        }
        return best;
    }

    // Only what glance and list show, plus our own receive time (parsing the ISO timestamp is costly).
    // Background.exit() carries about 8 KB at most.
    function slim(data as Dictionary) as Dictionary {
        var out = [] as Array<Dictionary>;
        var all = plants(data);
        for (var i = 0; i < all.size() && i < 12; i++) {
            var p = all[i] as Dictionary;
            out.add({ "id" => p["id"], "name" => p["name"], "status" => p["status"], "moisture" => p["moisture"], "ml" => p["ml"], "next_h" => p["next_h"] });
        }
        var alerts = list(data, "alerts");
        var roomRows = [] as Array<Dictionary>;
        var all2 = rooms(data);
        for (var i = 0; i < all2.size() && i < 4; i++) {
            var r = all2[i] as Dictionary;
            var row = { "id" => r["id"], "name" => r["name"], "temp" => r["temperature"], "hum" => r["humidity"], "status" => r["status"] };
            for (var j = 0; j < alerts.size(); j++) {
                var a = alerts[j] as Dictionary;
                if ((a["room"] as String).equals(r["name"] as String)) {
                    row["alert"] = a["message"];
                    row["severity"] = a["severity"];
                    break;
                }
            }
            roomRows.add(row);
        }
        return { "plants" => out, "rooms" => roomRows, "received" => Time.now().value() };
    }

    // --- texts --------------------------------------------------------------

    // 21.4 -> "21,4"
    function dec(v as Numeric) as String {
        var s = v.format("%.1f");
        var i = s.find(".");
        return i == null ? s : s.substring(0, i) + "," + s.substring(i + 1, s.length());
    }

    // hours until something: "jetzt", "in 5 Std.", "morgen", "in 3 Tagen"
    function inHours(h as Number?) as String {
        if (h == null) {
            return "–";
        }
        if (h <= 0) {
            return "jetzt";
        }
        if (h < 20) {
            return "in " + h + " Std.";
        }
        var d = (h + 12) / 24;
        return d <= 1 ? "morgen" : "in " + d + " Tagen";
    }

    // hours since something: "vor 5 Std.", "gestern", "vor 6 Tagen"
    function agoHours(h as Number?) as String {
        if (h == null) {
            return "–";
        }
        if (h < 1) {
            return "gerade eben";
        }
        if (h < 20) {
            return "vor " + h + " Std.";
        }
        var d = (h + 12) / 24;
        return d <= 1 ? "gestern" : "vor " + d + " Tagen";
    }

    // second line of a plant row
    function plantLine(p as Dictionary) as String {
        var status = p["status"] as String;
        var next = p["next_h"] as Number?;
        if (status.equals("water_now")) {
            return p["ml"] != null ? "Jetzt " + (p["ml"] as Numeric).format("%d") + " ml" : "Jetzt gießen";
        }
        if (status.equals("water_soon")) {
            return "gießen " + inHours(next);
        }
        if (status.equals("ok")) {
            return next != null ? "gießen " + inHours(next) : "gut versorgt";
        }
        return "keine Messwerte";
    }

    // second line of a room row
    function roomLine(r as Dictionary) as String {
        var parts = "";
        if (r["temp"] != null) {
            parts = dec(r["temp"] as Numeric) + " °C";
        }
        if (r["hum"] != null) {
            parts = parts + (parts.length() > 0 ? " · " : "") + (r["hum"] as Numeric).format("%d") + " %";
        }
        return parts.length() > 0 ? parts : "kein Hygrometer";
    }

    // "20,7° · 50 %", for the glance
    function climateShort(r as Dictionary) as String {
        var t = r["temp"];
        var hum = r["hum"];
        if (t == null && hum == null) {
            return "";
        }
        return (t == null ? "–" : dec(t as Numeric) + "°") + " · " + (hum == null ? "–" : (hum as Numeric).format("%d") + " %");
    }

    function color(status as String) as Number {
        if (status.equals("water_now") || status.equals("critical")) {
            return RED;
        }
        if (status.equals("water_soon") || status.equals("warning") || status.equals("too_dry") || status.equals("too_humid")) {
            return OCHRE;
        }
        if (status.equals("ok")) {
            return GREEN;
        }
        return GREY;
    }

    function roomColor(r as Dictionary) as Number {
        return r["severity"] != null ? color(r["severity"] as String) : color(r["status"] as String);
    }
}
