import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;

// Drawing helpers shared by the list and the detail pages (foreground only).
module PlantsDraw {
    const CENTER = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
    const LEFT = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;
    const RIGHT = Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER;

    function text(dc as Graphics.Dc, x as Numeric, y as Numeric, font as Graphics.FontType, s as String, color as Number, justify as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, s, justify);
    }

    // shortens a text with "…" until it fits into maxWidth pixels
    function fit(dc as Graphics.Dc, s as String, font as Graphics.FontType, maxWidth as Numeric) as String {
        if (dc.getTextWidthInPixels(s, font) <= maxWidth) {
            return s;
        }
        var n = s.length();
        while (n > 1 && dc.getTextWidthInPixels(s.substring(0, n) + "…", font) > maxWidth) {
            n--;
        }
        return s.substring(0, n) + "…";
    }

    // Garmin angles: 0° = 3 o'clock, counter-clockwise. The gauge runs clockwise from 225° (7:30) to -45° (4:30).
    function gaugeArc(dc as Graphics.Dc, cx as Numeric, cy as Numeric, r as Numeric, from as Float, to as Float, color as Number) as Void {
        if (to - from < 0.005) {
            return;
        }
        var a0 = 225 - 270 * from;
        var a1 = 225 - 270 * to;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, norm(a0), norm(a1));
    }

    function norm(a as Numeric) as Number {
        var n = a.toNumber() % 360;
        return n < 0 ? n + 360 : n;
    }

    function clamp(v as Float) as Float {
        return v < 0.0 ? 0.0 : v > 1.0 ? 1.0 : v;
    }

    // page indicator on the right edge, like Garmin's own widgets
    function pager(dc as Graphics.Dc, page as Number, count as Number) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var r = w / 2 - w * 0.045;
        for (var i = 0; i < count; i++) {
            var a = Math.toRadians((i - (count - 1) / 2.0) * 7);
            var x = w / 2 + r * Math.cos(a);
            var y = h / 2 + r * Math.sin(a);
            dc.setColor(i == page ? PlantsData.TEXT : PlantsData.DIM, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x, y, i == page ? 5 : 3);
        }
    }

    // full-screen message while loading or on errors
    function message(dc as Graphics.Dc, title as String, line as String) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(PlantsData.TEXT, Graphics.COLOR_BLACK);
        dc.clear();
        text(dc, w / 2, h * 0.42, Graphics.FONT_SMALL, fit(dc, title, Graphics.FONT_SMALL, w * 0.8), PlantsData.TEXT, CENTER);
        text(dc, w / 2, h * 0.56, Graphics.FONT_XTINY, line, PlantsData.GREY, CENTER);
    }

    function errorText(code as Number) as String {
        return code == 401 ? "Token falsch" : code == 404 ? "nicht gefunden" : code < 0 ? "keine Verbindung" : "Fehler " + code;
    }
}
