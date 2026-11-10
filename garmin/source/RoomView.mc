import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// One room: temperature and air humidity, humidity over the last 24 hours against the room's
// target band, and what to do. Loads `summary?view=room` when opened.
class RoomView extends WatchUi.View {
    var room as Dictionary;
    var detail as Dictionary? = null;
    var error as String? = null;

    function initialize(r as Dictionary) {
        View.initialize();
        room = r;
    }

    function onShow() as Void {
        if (detail == null) {
            PlantsData.fetchDetail("room", room["id"] as String, method(:onReceive));
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

    function onUpdate(dc as Graphics.Dc) as Void {
        if (detail == null) {
            PlantsDraw.message(dc, room["name"] as String, error != null ? error : "lädt…");
            return;
        }
        var d = detail as Dictionary;
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(PlantsData.TEXT, Graphics.COLOR_BLACK);
        dc.clear();
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_SMALL, PlantsDraw.fit(dc, d["name"] as String, Graphics.FONT_SMALL, w * 0.6), PlantsData.TEXT, PlantsDraw.CENTER);

        var t = d["temp"];
        var hum = d["humidity"];
        PlantsDraw.text(dc, w * 0.31, h * 0.3, Graphics.FONT_NUMBER_MILD, t == null ? "–" : PlantsData.dec(t as Numeric) + "°", PlantsData.TEXT, PlantsDraw.CENTER);
        PlantsDraw.text(dc, w * 0.31, h * 0.41, Graphics.FONT_XTINY, "Temperatur", PlantsData.GREY, PlantsDraw.CENTER);
        PlantsDraw.text(dc, w * 0.69, h * 0.3, Graphics.FONT_NUMBER_MILD, hum == null ? "–" : (hum as Numeric).format("%d") + "%", PlantsData.BLUE, PlantsDraw.CENTER);
        PlantsDraw.text(dc, w * 0.69, h * 0.41, Graphics.FONT_XTINY, "Luftfeuchte", PlantsData.GREY, PlantsDraw.CENTER);

        drawHumidity(dc, d);

        var status = d["status"] as String;
        var text = status.equals("ok") ? "alles im grünen Bereich"
            : status.equals("too_dry") ? "zu trocken – befeuchten"
            : status.equals("too_humid") ? "zu feucht – lüften"
            : "kein Hygrometer zugeordnet";
        PlantsDraw.text(dc, w / 2, h * 0.87, Graphics.FONT_XTINY, text, PlantsData.color(status), PlantsDraw.CENTER);
    }

    // humidity over 24 hours, the target as a band
    function drawHumidity(dc as Graphics.Dc, d as Dictionary) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var series = d["humidity_series"] instanceof Array ? d["humidity_series"] as Array : [];
        var n = series.size();
        var any = false;
        for (var i = 0; i < n; i++) {
            if (series[i] != null) { any = true; }
        }
        if (!any) {
            return;
        }
        var lo = 20.0;
        var hi = 80.0;
        var x0 = w * 0.16;
        var x1 = w * 0.84;
        var y0 = h * 0.5;
        var y1 = h * 0.74;
        if (d["min"] != null && d["max"] != null) {
            var top = y1 - (y1 - y0) * ((d["max"] as Numeric).toFloat() - lo) / (hi - lo);
            var bottom = y1 - (y1 - y0) * ((d["min"] as Numeric).toFloat() - lo) / (hi - lo);
            dc.setColor(0x1C2A33, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x0, top, x1 - x0, bottom - top);
        }
        dc.setPenWidth(3);
        dc.setColor(PlantsData.BLUE, Graphics.COLOR_TRANSPARENT);
        // x of the previous point, -1 after a gap
        var lastX = -1.0;
        var lastY = 0.0;
        for (var i = 0; i < n; i++) {
            if (series[i] == null) {
                lastX = -1.0;
                continue;
            }
            var v = (series[i] as Numeric).toFloat();
            v = v < lo ? lo : v > hi ? hi : v;
            var x = x0 + (x1 - x0) * i / (n - 1.0);
            var y = y1 - (y1 - y0) * (v - lo) / (hi - lo);
            if (lastX >= 0) {
                dc.drawLine(lastX, lastY, x, y);
            }
            lastX = x;
            lastY = y;
        }
        dc.setPenWidth(1);
        PlantsDraw.text(dc, w / 2, h * 0.79, Graphics.FONT_XTINY, "Luftfeuchte · 24 Std.", PlantsData.DIM, PlantsDraw.CENTER);
    }
}

class RoomDelegate extends WatchUi.BehaviorDelegate {
    function initialize(v as RoomView) {
        BehaviorDelegate.initialize();
    }
}
