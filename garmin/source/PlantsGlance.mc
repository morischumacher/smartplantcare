import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Glance in the widget loop: "2 Pflanzen gießen" and the most urgent plant with its moisture.
(:glance)
class PlantsGlance extends WatchUi.GlanceView {
    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var data = PlantsData.load();
        var list = PlantsData.plants(data);
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h / 4, Graphics.FONT_GLANCE, PlantsData.headline(data), Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        if (list.size() > 0) {
            var top = list[0] as Dictionary;
            var status = top["status"] as String;
            var line = status.equals("ok") ? list.size() + " Pflanzen im grünen Bereich" : top["name"] + " · " + PlantsData.moisture(top);
            dc.setColor(PlantsData.color(status), Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(5, h * 3 / 4, 5);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(16, h * 3 / 4, Graphics.FONT_GLANCE, line, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }
}
