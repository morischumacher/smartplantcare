import Toybox.Application.Storage;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Time;

// Loading and reading the compact summary:
// { generated_at, attention, plants: [{ name, room, status, moisture, ml, next, hint }], rooms: [...] }
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

    function headline(data as Dictionary?) as String {
        if (data == null) {
            return "Keine Daten";
        }
        var now = countStatus(data, "water_now");
        if (now > 0) {
            return now == 1 ? "1 Pflanze gießen" : now + " Pflanzen gießen";
        }
        var soon = countStatus(data, "water_soon");
        if (soon > 0) {
            return soon == 1 ? "1 Pflanze bald" : soon + " Pflanzen bald";
        }
        return "Alles gut";
    }

    function moisture(plant as Dictionary) as String {
        var m = plant["moisture"];
        return m == null ? "–" : m.format("%d") + " %";
    }

    // Only what glance and list show, plus our own receive time (parsing the ISO timestamp is costly).
    // Background.exit() carries about 8 KB at most.
    function slim(data as Dictionary) as Dictionary {
        var out = [] as Array<Dictionary>;
        var list = plants(data);
        for (var i = 0; i < list.size() && i < 12; i++) {
            var p = list[i] as Dictionary;
            out.add({ "name" => p["name"], "status" => p["status"], "moisture" => p["moisture"], "ml" => p["ml"] });
        }
        return { "plants" => out, "received" => Time.now().value() };
    }

    function color(status as String) as Number {
        if (status.equals("water_now")) {
            return 0xF43F5E;
        }
        if (status.equals("water_soon")) {
            return 0xF59E0B;
        }
        if (status.equals("ok")) {
            return 0x10B981;
        }
        return 0xA8A29E;
    }
}
