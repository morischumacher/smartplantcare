import Toybox.Application.Storage;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Time;

// Loading and reading the compact summary:
// { generated_at, attention, alerts: [{ room, kind, severity, message }],
//   plants: [{ name, room, status, moisture, ml, next, hint }], rooms: [...] }
// Stored slim: one list of rows, climate alerts as rows with status "climate_warning"/"climate_critical",
// the room as name and the message as text.
(:background :glance)
module PlantsData {
    const KEY = "summary";
    const URL = "https://zvymcgkkjrfxqoartwrp.supabase.co/functions/v1/summary";

    function fetch(callback as Method(responseCode as Number, data as Dictionary or String or Null) as Void) as Void {
        Communications.makeWebRequest(
            URL,
            { "view" => "compact" },
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

    function plants(data as Dictionary?) as Array {
        if (data == null || !(data["plants"] instanceof Array)) {
            return [];
        }
        return data["plants"] as Array;
    }

    function countStatus(data as Dictionary?, status as String) as Number {
        var n = 0;
        var list = plants(data);
        for (var i = 0; i < list.size(); i++) {
            if (((list[i] as Dictionary)["status"] as String).equals(status)) {
                n++;
            }
        }
        return n;
    }

    function isAlert(row as Dictionary) as Boolean {
        return (row["status"] as String).find("climate") == 0;
    }

    // "Luft zu trocken (31 %) – befeuchten" -> "Luft zu trocken"
    function alertTitle(row as Dictionary) as String {
        var text = row["text"] as String;
        var i = text.find(" (");
        return (row["name"] as String) + ": " + (i == null ? text : text.substring(0, i));
    }

    // Most urgent first: water now, climate, water soon.
    function headline(data as Dictionary?) as String {
        if (data == null) {
            return "Keine Daten";
        }
        var now = countStatus(data, "water_now");
        if (now > 0) {
            return now == 1 ? "1 Pflanze gießen" : now + " Pflanzen gießen";
        }
        var list = plants(data);
        for (var i = 0; i < list.size(); i++) {
            if (isAlert(list[i] as Dictionary)) {
                return alertTitle(list[i] as Dictionary);
            }
        }
        var soon = countStatus(data, "water_soon");
        if (soon > 0) {
            return soon == 1 ? "1 Pflanze bald" : soon + " Pflanzen bald";
        }
        if (list.size() > 0 && countStatus(data, "no_data") == list.size()) {
            return "Keine Sensordaten";
        }
        return "Alles gut";
    }

    // second line of a row: moisture, or the alert text
    function detail(row as Dictionary) as String {
        if (isAlert(row)) {
            return row["text"] as String;
        }
        var m = row["moisture"];
        return m == null ? "–" : m.format("%d") + " %";
    }

    // Only what glance and list show, plus our own receive time (parsing the ISO timestamp is costly).
    // Background.exit() carries about 8 KB at most.
    function slim(data as Dictionary) as Dictionary {
        var out = [] as Array<Dictionary>;
        var list = plants(data);
        var alerts = data["alerts"] instanceof Array ? data["alerts"] as Array : [];
        // plants arrive sorted by status: water_now first, then the alerts, then the rest
        var i = 0;
        for (; i < list.size() && ((list[i] as Dictionary)["status"] as String).equals("water_now"); i++) {
            out.add(slimPlant(list[i] as Dictionary));
        }
        for (var j = 0; j < alerts.size(); j++) {
            var a = alerts[j] as Dictionary;
            out.add({ "name" => a["room"], "status" => "climate_" + a["severity"], "text" => a["message"] });
        }
        for (; i < list.size() && out.size() < 12; i++) {
            out.add(slimPlant(list[i] as Dictionary));
        }
        return { "plants" => out, "received" => Time.now().value() };
    }

    function slimPlant(p as Dictionary) as Dictionary {
        return { "name" => p["name"], "status" => p["status"], "moisture" => p["moisture"], "ml" => p["ml"] };
    }

    function color(status as String) as Number {
        if (status.equals("water_now") || status.equals("climate_critical")) {
            return 0xF43F5E;
        }
        if (status.equals("water_soon") || status.equals("climate_warning")) {
            return 0xF59E0B;
        }
        if (status.equals("ok")) {
            return 0x10B981;
        }
        return 0xA8A29E;
    }
}
