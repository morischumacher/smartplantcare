import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// One plant on four pages (up/down): status, measurements against their targets, moisture over
// 7 days, watering and what was learned. Loads `summary?view=plant` when opened.
class PlantDetailView extends WatchUi.View {
    const PAGES = 4;
    var plant as Dictionary;
    var page as Number = 0;
    var detail as Dictionary? = null;
    var error as String? = null;

    function initialize(p as Dictionary) {
        View.initialize();
        plant = p;
    }

    function onShow() as Void {
        if (detail == null) {
            PlantsData.fetchDetail("plant", plant["id"] as String, method(:onReceive));
        }
    }

    function onReceive(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (responseCode == 200 && data instanceof Dictionary) {
            detail = data;
        } else {
            error = PlantsDraw.errorText(responseCode);
        }
        WatchUi.requestUpdate();
    }

    function turn(by as Number) as Void {
        page = (page + by + PAGES) % PAGES;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        if (detail == null) {
            PlantsDraw.message(dc, plant["name"] as String, error != null ? error : "lädt…");
            return;
        }
        dc.setColor(PlantsData.TEXT, Graphics.COLOR_BLACK);
        dc.clear();
        var d = detail as Dictionary;
        if (page == 0) {
            drawStatus(dc, d);
        } else if (page == 1) {
            drawValues(dc, d);
        } else if (page == 2) {
            drawHistory(dc, d);
        } else {
            drawWatering(dc, d);
        }
        PlantsDraw.pager(dc, page, PAGES);
    }

    // what to do now, as on the web app's plant page
    function action(d as Dictionary) as String {
        var status = d["status"] as String;
        var ml = d["ml"];
        if (status.equals("water_now")) {
            return ml != null ? "Jetzt gießen · " + (ml as Numeric).format("%d") + " ml" : "Jetzt gießen";
        }
        if (status.equals("water_soon")) {
            return "Gießen " + PlantsData.inHours(d["next_h"] as Number?) + (ml != null ? " · " + (ml as Numeric).format("%d") + " ml" : "");
        }
        if (status.equals("ok")) {
            return d["next_h"] != null ? "Gießen " + PlantsData.inHours(d["next_h"] as Number?) : "Gut versorgt";
        }
        return "Keine Messwerte";
    }

    function drawStatus(dc as Graphics.Dc, d as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var color = PlantsData.color(d["status"] as String);
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_SMALL, PlantsDraw.fit(dc, d["name"] as String, Graphics.FONT_SMALL, w * 0.6), PlantsData.TEXT, PlantsDraw.CENTER);

        var cx = w / 2;
        var cy = h * 0.45;
        var r = w * 0.23;
        dc.setPenWidth((w * 0.04).toNumber());
        PlantsDraw.gaugeArc(dc, cx, cy, r, 0.0, 1.0, PlantsData.TRACK);
        var min = (d["min"] as Numeric).toFloat() / 100;
        var max = (d["max"] as Numeric).toFloat() / 100;
        PlantsDraw.gaugeArc(dc, cx, cy, r, min, max, PlantsData.BAND);
        var m = d["moisture"];
        if (m != null) {
            PlantsDraw.gaugeArc(dc, cx, cy, r, 0.0, PlantsDraw.clamp((m as Numeric).toFloat() / 100), color);
        }
        dc.setPenWidth(1);
        PlantsDraw.text(dc, cx, cy - h * 0.02, Graphics.FONT_NUMBER_MEDIUM, m == null ? "–" : (m as Numeric).format("%d"), PlantsData.TEXT, PlantsDraw.CENTER);
        PlantsDraw.text(dc, cx, cy + h * 0.1, Graphics.FONT_XTINY, "% Feuchte", PlantsData.GREY, PlantsDraw.CENTER);

        PlantsDraw.text(dc, cx, h * 0.7, Graphics.FONT_TINY, PlantsDraw.fit(dc, action(d), Graphics.FONT_TINY, w * 0.8), color, PlantsDraw.CENTER);
        var last = d["last_h"] == null ? "noch nicht gegossen" : "zuletzt " + PlantsData.agoHours(d["last_h"] as Number?)
            + (d["last_ml"] != null ? " · " + (d["last_ml"] as Numeric).format("%d") + " ml" : "");
        PlantsDraw.text(dc, cx, h * 0.79, Graphics.FONT_XTINY, last, PlantsData.GREY, PlantsDraw.CENTER);
        // a warning (too cold, stays wet …) beats the target line
        var hint = d["hint"];
        if (hint != null) {
            PlantsDraw.text(dc, cx, h * 0.87, Graphics.FONT_XTINY, PlantsDraw.fit(dc, hint as String, Graphics.FONT_XTINY, w * 0.6), PlantsData.RED, PlantsDraw.CENTER);
        } else {
            PlantsDraw.text(dc, cx, h * 0.87, Graphics.FONT_XTINY, "Ziel " + (d["min"] as Numeric).format("%d") + "–" + (d["max"] as Numeric).format("%d") + " %", PlantsData.DIM, PlantsDraw.CENTER);
        }
    }

    // a value with a bar: target range as a band, the value as a dot
    function bar(dc as Graphics.Dc, y as Numeric, label as String, value as String, pos as Float?, lo as Float?, hi as Float?, color as Number) as Void {
        var w = dc.getWidth();
        var x0 = w * 0.18;
        var x1 = w * 0.82;
        PlantsDraw.text(dc, x0, y, Graphics.FONT_XTINY, label, PlantsData.GREY, PlantsDraw.LEFT);
        PlantsDraw.text(dc, x1, y, Graphics.FONT_XTINY, value, PlantsData.TEXT, PlantsDraw.RIGHT);
        var by = y + w * 0.055;
        dc.setColor(PlantsData.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x0, by - 3, x1 - x0, 6, 3);
        if (lo != null && hi != null) {
            dc.setColor(PlantsData.BAND, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x0 + (x1 - x0) * lo, by - 3, (x1 - x0) * (hi - lo), 6);
        }
        if (pos != null) {
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x0 + (x1 - x0) * PlantsDraw.clamp(pos), by, 7);
        }
    }

    function drawValues(dc as Graphics.Dc, d as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, "Messwerte", PlantsData.GREY, PlantsDraw.CENTER);

        var m = d["moisture"];
        var min = (d["min"] as Numeric).toFloat();
        var max = (d["max"] as Numeric).toFloat();
        bar(dc, h * 0.25, "Feuchte", m == null ? "–" : (m as Numeric).format("%d") + " %", m == null ? null : (m as Numeric).toFloat() / 100,
            min / 100, max / 100, PlantsData.color(d["status"] as String));

        // temperature on a 5–35 °C scale
        var t = d["temp"];
        var tMin = d["temp_min"];
        var tMax = d["temp_max"];
        var tPos = t == null ? null : ((t as Numeric).toFloat() - 5) / 30;
        var tColor = PlantsData.GREEN;
        if (t != null && ((tMin != null && (t as Numeric) < (tMin as Numeric)) || (tMax != null && (t as Numeric) > (tMax as Numeric)))) {
            tColor = PlantsData.OCHRE;
        }
        bar(dc, h * 0.41, "Temperatur", t == null ? "–" : PlantsData.dec(t as Numeric) + " °C", tPos,
            tMin == null ? null : ((tMin as Numeric).toFloat() - 5) / 30, tMax == null ? null : ((tMax as Numeric).toFloat() - 5) / 30, tColor);

        // light: daily peak, as in the web app
        var l = d["light"];
        PlantsDraw.text(dc, w * 0.18, h * 0.58, Graphics.FONT_XTINY, "Licht", PlantsData.GREY, PlantsDraw.LEFT);
        PlantsDraw.text(dc, w * 0.82, h * 0.58, Graphics.FONT_XTINY, l == null ? "–" : (l as Numeric).format("%d") + " lux", PlantsData.TEXT, PlantsDraw.RIGHT);
        PlantsDraw.text(dc, w * 0.82, h * 0.645, Graphics.FONT_XTINY, l == null ? "" : lightLabel((l as Numeric).toNumber()), PlantsData.DIM, PlantsDraw.RIGHT);

        var ec = d["ec"];
        PlantsDraw.text(dc, w * 0.18, h * 0.74, Graphics.FONT_XTINY, "Dünger", PlantsData.GREY, PlantsDraw.LEFT);
        PlantsDraw.text(dc, w * 0.82, h * 0.74, Graphics.FONT_XTINY, ec == null ? "–" : (ec as Numeric).format("%d") + " µS", PlantsData.TEXT, PlantsDraw.RIGHT);
        PlantsDraw.text(dc, w * 0.82, h * 0.805, Graphics.FONT_XTINY, ec == null ? "" : ecLabel((ec as Numeric).toNumber()), PlantsData.DIM, PlantsDraw.RIGHT);
    }

    // same steps as the web app's lightCategory()
    function lightLabel(lux as Number) as String {
        return lux < 1000 ? "schattig" : lux < 5000 ? "hell, indirekt" : lux < 20000 ? "hell" : "sonnig";
    }

    function ecLabel(us as Number) as String {
        return us < 200 ? "kaum Nährstoffe" : us > 2000 ? "viel Dünger" : "ok";
    }

    function drawHistory(dc as Graphics.Dc, d as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, "Feuchte · 7 Tage", PlantsData.GREY, PlantsDraw.CENTER);
        var series = d["series"] instanceof Array ? d["series"] as Array : [];
        var min = (d["min"] as Numeric).toFloat();
        var max = (d["max"] as Numeric).toFloat();

        // y range: the target band plus whatever was measured, with some air
        var lo = min - 10;
        var hi = max + 10;
        for (var i = 0; i < series.size(); i++) {
            if (series[i] != null) {
                var v = (series[i] as Numeric).toFloat();
                if (v - 5 < lo) { lo = v - 5; }
                if (v + 5 > hi) { hi = v + 5; }
            }
        }
        if (lo < 0) { lo = 0.0; }
        if (hi > 100) { hi = 100.0; }

        var x0 = w * 0.14;
        var x1 = w * 0.82;
        var y0 = h * 0.24;
        var y1 = h * 0.7;
        dc.setColor(PlantsData.BAND, Graphics.COLOR_TRANSPARENT);
        var bandTop = y1 - (y1 - y0) * (max - lo) / (hi - lo);
        var bandBottom = y1 - (y1 - y0) * (min - lo) / (hi - lo);
        dc.fillRectangle(x0, bandTop, x1 - x0, bandBottom - bandTop);
        PlantsDraw.text(dc, x1 + 4, bandTop, Graphics.FONT_XTINY, (max).format("%d"), PlantsData.DIM, PlantsDraw.LEFT);
        PlantsDraw.text(dc, x1 + 4, bandBottom, Graphics.FONT_XTINY, (min).format("%d"), PlantsData.DIM, PlantsDraw.LEFT);

        var n = series.size();
        // x of the previous point, -1 after a gap
        var lastX = -1.0;
        var lastY = 0.0;
        dc.setPenWidth(3);
        dc.setColor(0xE9E6DC, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < n; i++) {
            if (series[i] == null) {
                lastX = -1.0;
                continue;
            }
            var x = x0 + (x1 - x0) * i / (n - 1.0);
            var y = y1 - (y1 - y0) * ((series[i] as Numeric).toFloat() - lo) / (hi - lo);
            if (lastX >= 0) {
                dc.drawLine(lastX, lastY, x, y);
            }
            lastX = x;
            lastY = y;
        }
        dc.setPenWidth(1);
        if (lastX >= 0) {
            dc.setColor(PlantsData.color(d["status"] as String), Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(lastX, lastY, 6);
        }

        // waterings as drops under the chart
        var watered = d["watered"] instanceof Array ? d["watered"] as Array : [];
        dc.setColor(PlantsData.BLUE, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < watered.size(); i++) {
            var x = x0 + (x1 - x0) * (watered[i] as Number) / (n - 1.0);
            dc.fillPolygon([[x, y1 + 6], [x - 6, y1 + 16], [x + 6, y1 + 16]]);
            dc.fillCircle(x, y1 + 17, 6);
        }

        var days = d["days"] instanceof Array ? d["days"] as Array : [];
        for (var i = 0; i < days.size(); i++) {
            PlantsDraw.text(dc, x0 + (x1 - x0) * (i + 0.5) / days.size(), h * 0.8, Graphics.FONT_XTINY, days[i] as String, PlantsData.DIM, PlantsDraw.CENTER);
        }
        if (watered.size() > 0) {
            PlantsDraw.text(dc, w / 2, h * 0.88, Graphics.FONT_XTINY, "Tropfen = gegossen", PlantsData.BLUE, PlantsDraw.CENTER);
        }
    }

    function drawWatering(dc as Graphics.Dc, d as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, "Gießen", PlantsData.GREY, PlantsDraw.CENTER);

        var ml = d["ml"];
        var last = d["last_h"] == null ? "–" : PlantsData.agoHours(d["last_h"] as Number?);
        var every = d["every_days"] == null ? "–" : "alle ~" + (d["every_days"] as Numeric).format("%d") + " Tage";
        var rate = d["dry_rate"] == null ? "–" : PlantsData.dec(d["dry_rate"] as Numeric) + " %/Tag";
        var samples = d["samples"] as Number?;
        var learned = samples == null || samples == 0 ? "Schätzung" : samples == 1 ? "1× Gießen" : samples + "× Gießen";
        var status = d["status"] as String;
        var next = status.equals("no_data") ? "–" : PlantsData.inHours(d["next_h"] as Number?);
        var rows = [
            ["Nächstes Mal", next, status.equals("water_now") ? PlantsData.RED : PlantsData.TEXT],
            ["Menge", ml == null ? "–" : (ml as Numeric).format("%d") + " ml", PlantsData.TEXT],
            ["Zuletzt", last, PlantsData.TEXT],
            ["Rhythmus", every, PlantsData.TEXT],
            ["Trocknet", rate, PlantsData.TEXT],
            ["Gelernt aus", learned, PlantsData.GREY]
        ];
        var y = h * 0.25;
        for (var i = 0; i < rows.size(); i++) {
            var row = rows[i] as Array;
            PlantsDraw.text(dc, w * 0.17, y, Graphics.FONT_XTINY, row[0] as String, PlantsData.GREY, PlantsDraw.LEFT);
            PlantsDraw.text(dc, w * 0.83, y, Graphics.FONT_XTINY, row[1] as String, row[2] as Number, PlantsDraw.RIGHT);
            if (i < rows.size() - 1) {
                dc.setColor(PlantsData.TRACK, Graphics.COLOR_TRANSPARENT);
                dc.drawLine(w * 0.17, y + h * 0.056, w * 0.83, y + h * 0.056);
            }
            y += h * 0.112;
        }
    }
}

class PlantDetailDelegate extends WatchUi.BehaviorDelegate {
    var view as PlantDetailView;

    function initialize(v as PlantDetailView) {
        BehaviorDelegate.initialize();
        view = v;
    }

    function onNextPage() as Boolean {
        view.turn(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        view.turn(-1);
        return true;
    }

    // Start or a tap: next page as well, so one hand is enough
    function onSelect() as Boolean {
        view.turn(1);
        return true;
    }
}
