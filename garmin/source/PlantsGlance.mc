import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Glance in the widget loop, two lines:
//   what matters most ("Efeutute gießen", "Mein Zimmer: Luft zu trocken", "Alles in Ordnung")
//   the room climate and when the next plant is due ("20,7° · 50 %  ·  Efeutute in 5 Tagen")
// A thin bar on the left carries the colour of the headline.
(:glance)
class PlantsGlance extends WatchUi.GlanceView {
    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var data = PlantsData.load();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var justify = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;

        var color = PlantsData.GREEN;
        if (data == null || PlantsData.plants(data).size() == 0) {
            color = PlantsData.GREY;
        } else if (PlantsData.countStatus(data, "water_now") > 0) {
            color = PlantsData.RED;
        } else if (PlantsData.alertRoom(data) != null) {
            color = PlantsData.roomColor(PlantsData.alertRoom(data) as Dictionary);
        } else if (PlantsData.countStatus(data, "water_soon") > 0) {
            color = PlantsData.OCHRE;
        } else if (PlantsData.countStatus(data, "no_data") == PlantsData.plants(data).size()) {
            color = PlantsData.GREY;
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(0, h * 0.12, 5, h * 0.76, 2);

        dc.setColor(PlantsData.TEXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(14, h * 0.3, Graphics.FONT_GLANCE, fit(dc, PlantsData.headline(data), w - 14), justify);

        var parts = "";
        var rooms = PlantsData.rooms(data);
        if (rooms.size() > 0) {
            parts = PlantsData.climateShort(rooms[0] as Dictionary);
        }
        var next = PlantsData.nextPlant(data);
        if (next != null) {
            var n = next as Dictionary;
            parts = parts + (parts.length() > 0 ? "  ·  " : "") + (n["name"] as String) + " " + PlantsData.inHours(n["next_h"] as Number?);
        }
        dc.setColor(PlantsData.GREY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(14, h * 0.72, Graphics.FONT_GLANCE, fit(dc, parts, w - 14), justify);
    }

    function fit(dc as Graphics.Dc, s as String, maxWidth as Numeric) as String {
        var n = s.length();
        if (dc.getTextWidthInPixels(s, Graphics.FONT_GLANCE) <= maxWidth) {
            return s;
        }
        while (n > 1 && dc.getTextWidthInPixels(s.substring(0, n) + "…", Graphics.FONT_GLANCE) > maxWidth) {
            n--;
        }
        return s.substring(0, n) + "…";
    }
}
