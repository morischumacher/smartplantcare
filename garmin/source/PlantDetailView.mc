import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
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
        // in winter the title says so: the targets below are the winter ones
        var winter = d["winter"];
        var title = winter == null ? "Messwerte" : (winter as String).equals("rest") ? "Winterruhe" : "Winterpause";
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, title, winter == null ? PlantsData.GREY : PlantsData.BLUE, PlantsDraw.CENTER);

        var m = d["moisture"];
        bar(dc, h * 0.24, "Feuchte", m == null ? "–" : (m as Numeric).format("%d") + " %", m == null ? null : (m as Numeric).toFloat() / 100,
            (d["min"] as Numeric).toFloat() / 100, (d["max"] as Numeric).toFloat() / 100, PlantsData.color(d["status"] as String));

        // temperature on a 5–35 °C scale
        var t = d["temp"];
        bar(dc, h * 0.4, "Temperatur", t == null ? "–" : PlantsData.dec(t as Numeric) + " °C",
            t == null ? null : tempPos(t as Numeric), d["temp_min"] == null ? null : tempPos(d["temp_min"] as Numeric),
            d["temp_max"] == null ? null : tempPos(d["temp_max"] as Numeric), rangeColor(t, d["temp_min"], d["temp_max"]));

        // light: daily peak on a log scale 100 – 50,000 lux, as the eye sees it. The green band is the
        // plant's year-round target; in winter a thin line below shows what is normal this month, and
        // the dot is only ochre when it is darker than that.
        var l = d["light"];
        var sMin = d["light_season_min"];
        var sMax = d["light_season_max"];
        var season = sMin != null && sMax != null;
        bar(dc, h * 0.56, "Licht", lightWord(l, d["light_min"], d["light_max"], sMin),
            l == null ? null : luxPos(l as Numeric), d["light_min"] == null ? null : luxPos(d["light_min"] as Numeric),
            d["light_max"] == null ? null : luxPos(d["light_max"] as Numeric),
            season ? rangeColor(l, sMin, d["light_max"]) : rangeColor(l, d["light_min"], d["light_max"]));
        if (season) {
            var x0 = w * 0.18;
            var x1 = w * 0.82;
            var a = x0 + (x1 - x0) * PlantsDraw.clamp(luxPos(sMin as Numeric));
            var b = x0 + (x1 - x0) * PlantsDraw.clamp(luxPos(sMax as Numeric));
            var ly = h * 0.56 + w * 0.055 + 10;
            dc.setColor(PlantsData.BLUE, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(a, ly, b - a, 3, 1);
            PlantsDraw.text(dc, w / 2, h * 0.87, Graphics.FONT_XTINY, "blau = normal im Winter", PlantsData.BLUE, PlantsDraw.CENTER);
        }

        // fertiliser: conductivity 0 – 2,500 µS/cm; without plant targets the web app's 200 – 2000
        var ec = d["ec"];
        var ecMin = d["ec_min"] != null ? d["ec_min"] : 200;
        var ecMax = d["ec_max"] != null ? d["ec_max"] : 2000;
        bar(dc, h * 0.72, "Dünger", ec == null ? "–" : (ec as Numeric) < (ecMin as Numeric) ? "zu wenig" : (ec as Numeric) > (ecMax as Numeric) ? "zu viel" : "passt",
            ec == null ? null : (ec as Numeric).toFloat() / 2500, (ecMin as Numeric).toFloat() / 2500, (ecMax as Numeric).toFloat() / 2500,
            rangeColor(ec, ecMin, ecMax));
    }

    // like the fertiliser: a word instead of lux; in winter "ok für Winter" when it is only dark
    // because of the season
    function lightWord(l, lo, hi, seasonMin) as String {
        if (l == null) {
            return "–";
        }
        var v = (l as Numeric).toFloat();
        if (hi != null && v > (hi as Numeric).toFloat()) {
            return "zu hell";
        }
        if (lo == null || v >= (lo as Numeric).toFloat()) {
            return "passt";
        }
        return seasonMin != null && v >= (seasonMin as Numeric).toFloat() ? "ok für Winter" : "zu dunkel";
    }

    function tempPos(v as Numeric) as Float {
        return (v.toFloat() - 5) / 30;
    }

    function luxPos(v as Numeric) as Float {
        var lux = v.toFloat() < 100 ? 100.0 : v.toFloat();
        return ((Math.log(lux, 10) - 2) / 2.7).toFloat();
    }

    // green inside the target, ochre outside, green when there is no target
    function rangeColor(v, lo, hi) as Number {
        if (v == null) {
            return PlantsData.GREY;
        }
        var x = (v as Numeric).toFloat();
        if ((lo != null && x < (lo as Numeric).toFloat()) || (hi != null && x > (hi as Numeric).toFloat())) {
            return PlantsData.OCHRE;
        }
        return PlantsData.GREEN;
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
        var count = 0;
        for (var i = 0; i < series.size(); i++) {
            if (series[i] != null) {
                count++;
                var v = (series[i] as Numeric).toFloat();
                if (v - 5 < lo) { lo = v - 5; }
                if (v + 5 > hi) { hi = v + 5; }
            }
        }
        if (lo < 0) { lo = 0.0; }
        if (hi > 100) { hi = 100.0; }

        // as wide as the round screen allows at this height
        var x0 = w * 0.12;
        var x1 = w * 0.88;
        var y0 = h * 0.22;
        var y1 = h * 0.66;
        var bandTop = y1 - (y1 - y0) * (max - lo) / (hi - lo);
        var bandBottom = y1 - (y1 - y0) * (min - lo) / (hi - lo);
        dc.setColor(PlantsData.BAND, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(x0, bandTop, x1 - x0, bandBottom - bandTop);
        dc.setColor(PlantsData.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(x0, y1, x1, y1);
        // target limits inside the band, left
        PlantsDraw.text(dc, x0 + 6, bandTop + 14, Graphics.FONT_XTINY, max.format("%d"), PlantsData.GREEN, PlantsDraw.LEFT);
        PlantsDraw.text(dc, x0 + 6, bandBottom - 14, Graphics.FONT_XTINY, min.format("%d"), PlantsData.GREEN, PlantsDraw.LEFT);

        // the line runs across gaps (sensor not received), single values still show as dots
        var n = series.size();
        var lastX = -1.0;
        var lastY = 0.0;
        dc.setColor(0xE9E6DC, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);
        for (var i = 0; i < n; i++) {
            if (series[i] == null) {
                continue;
            }
            var x = x0 + (x1 - x0) * i / (n - 1.0);
            var y = y1 - (y1 - y0) * ((series[i] as Numeric).toFloat() - lo) / (hi - lo);
            if (lastX >= 0) {
                dc.drawLine(lastX, lastY, x, y);
            } else if (count < 3) {
                dc.fillCircle(x, y, 3);
            }
            lastX = x;
            lastY = y;
        }
        dc.setPenWidth(1);
        if (lastX >= 0) {
            dc.setColor(PlantsData.color(d["status"] as String), Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(lastX, lastY, 6);
        } else {
            PlantsDraw.text(dc, w / 2, (y0 + y1) / 2, Graphics.FONT_XTINY, "noch keine Werte", PlantsData.GREY, PlantsDraw.CENTER);
        }

        // waterings as drops on the axis
        var watered = d["watered"] instanceof Array ? d["watered"] as Array : [];
        dc.setColor(PlantsData.BLUE, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < watered.size(); i++) {
            var x = x0 + (x1 - x0) * (watered[i] as Number) / (n - 1.0);
            dc.fillPolygon([[x, y1 - 14], [x - 6, y1 - 4], [x + 6, y1 - 4]]);
            dc.fillCircle(x, y1 - 3, 6);
        }

        // every other day, counted from today (the last label), so they don't run together
        var days = d["days"] instanceof Array ? d["days"] as Array : [];
        var nd = days.size();
        for (var i = 0; i < nd; i++) {
            if ((nd - 1 - i) % 2 == 0) {
                PlantsDraw.text(dc, x0 + (x1 - x0) * (i + 0.5) / nd, h * 0.73, Graphics.FONT_XTINY, days[i] as String, PlantsData.DIM, PlantsDraw.CENTER);
            }
        }
        if (watered.size() > 0) {
            PlantsDraw.text(dc, w / 2, h * 0.83, Graphics.FONT_XTINY, "Tropfen = gegossen", PlantsData.BLUE, PlantsDraw.CENTER);
        }
    }

    function drawWatering(dc as Graphics.Dc, d as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, "Gießen", PlantsData.GREY, PlantsDraw.CENTER);

        var ml = d["ml"];
        var last = d["last_h"] == null ? "–" : PlantsData.agoHours(d["last_h"] as Number?);
        var every = d["every_days"] == null ? "–" : "~" + (d["every_days"] as Numeric).format("%d") + " Tage";
        var rate = d["dry_rate"] == null ? "–" : PlantsData.dec(d["dry_rate"] as Numeric) + " %/T.";
        var samples = d["samples"] as Number?;
        var learned = samples == null || samples == 0 ? "Schätzung" : samples.toString() + "× gegossen";
        var status = d["status"] as String;
        var next = status.equals("no_data") ? "–" : PlantsData.inHours(d["next_h"] as Number?);
        var rows = [
            ["Nächstes", next, status.equals("water_now") ? PlantsData.RED : PlantsData.TEXT],
            ["Menge", ml == null ? "–" : (ml as Numeric).format("%d") + " ml", PlantsData.TEXT],
            ["Zuletzt", last, PlantsData.TEXT],
            ["Rhythmus", every, PlantsData.TEXT],
            ["Trocknet", rate, PlantsData.TEXT],
            ["Gelernt", learned, PlantsData.GREY]
        ];
        // 2 columns × 3 rows: label above, value below, so nothing has to share a line
        for (var i = 0; i < rows.size(); i++) {
            var row = rows[i] as Array;
            var x = i % 2 == 0 ? w * 0.31 : w * 0.69;
            var y = h * 0.27 + (i / 2) * h * 0.2;
            PlantsDraw.text(dc, x, y, Graphics.FONT_XTINY, row[0] as String, PlantsData.GREY, PlantsDraw.CENTER);
            PlantsDraw.text(dc, x, y + h * 0.075, Graphics.FONT_XTINY, PlantsDraw.fit(dc, row[1] as String, Graphics.FONT_XTINY, w * 0.36), row[2] as Number, PlantsDraw.CENTER);
        }
        dc.setColor(PlantsData.TRACK, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(w / 2, h * 0.23, w / 2, h * 0.8);
        dc.drawLine(w * 0.14, h * 0.415, w * 0.86, h * 0.415);
        dc.drawLine(w * 0.14, h * 0.615, w * 0.86, h * 0.615);
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
