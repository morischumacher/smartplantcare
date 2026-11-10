import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Glance in the widget loop: "2 Pflanzen gießen" and the most urgent plant with its moisture,
// or a climate alert ("Wohnzimmer: Luft zu trocken" and what to do).
(:glance)
class PlantsGlance extends WatchUi.GlanceView {
    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var data = PlantsData.load();
        var list = PlantsData.plants(data);
        var h = dc.getHeight();

        dc.setColor(PlantsData.TEXT, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h / 4, Graphics.FONT_GLANCE, PlantsData.headline(data), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        if (list.size() == 0) {
            return;
        }
        var top = list[0] as Dictionary;
        var status = top["status"] as String;
        var room = PlantsData.alertRoom(data);
        var line;
        var color;
        if (!status.equals("water_now") && room != null) {
            line = room["alert"] as String;
            color = PlantsData.roomColor(room);
        } else if (status.equals("ok")) {
            line = list.size() + " Pflanzen im grünen Bereich";
            color = PlantsData.GREEN;
        } else {
            var m = top["moisture"];
            line = (top["name"] as String) + " · " + (m == null ? "–" : (m as Numeric).format("%d") + " %");
            color = PlantsData.color(status);
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(5, h * 3 / 4, 5);
        dc.setColor(PlantsData.GREY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(16, h * 3 / 4, Graphics.FONT_GLANCE, line, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}
