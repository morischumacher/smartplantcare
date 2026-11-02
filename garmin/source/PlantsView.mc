import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.WatchUi;

// Detail view when the glance is opened: list of plants with status dot, moisture and amount;
// climate alerts as rows with the room and what to do.
// Up/down scrolls, Start refreshes.
class PlantsView extends WatchUi.View {
    const ROWS = 4;
    var offset as Number = 0;
    var loading as Boolean = false;
    var error as String? = null;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        refresh();
    }

    function refresh() as Void {
        loading = true;
        error = null;
        WatchUi.requestUpdate();
        PlantsData.fetch(method(:onReceive));
    }

    function onReceive(responseCode as Number, data as Dictionary or String or Null) as Void {
        loading = false;
        if (responseCode == 200 && data instanceof Dictionary) {
            Application.Storage.setValue(PlantsData.KEY, PlantsData.slim(data));
        } else {
            error = responseCode == 401 ? "Token falsch" : "Fehler " + responseCode;
        }
        WatchUi.requestUpdate();
    }

    function scroll(by as Number) as Void {
        var n = PlantsData.plants(PlantsData.load()).size();
        var max = n > ROWS ? n - ROWS : 0;
        offset += by;
        if (offset < 0) {
            offset = 0;
        } else if (offset > max) {
            offset = max;
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var data = PlantsData.load();
        var list = PlantsData.plants(data);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();
        dc.drawText(w / 2, h * 0.14, Graphics.FONT_SMALL, PlantsData.headline(data), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        var rowH = h * 0.15;
        var top = h * 0.27;
        for (var i = 0; i < ROWS && offset + i < list.size(); i++) {
            var p = list[offset + i] as Dictionary;
            var y = top + i * rowH + rowH / 2;
            var status = p["status"] as String;
            dc.setColor(PlantsData.color(status), Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(w * 0.16, y, 7);
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w * 0.22, y - rowH * 0.18, Graphics.FONT_XTINY, p["name"] as String, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
            var detail = PlantsData.detail(p);
            if (status.equals("water_now") && p["ml"] != null) {
                detail = detail + " · " + (p["ml"] as Number).format("%d") + " ml";
            }
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w * 0.22, y + rowH * 0.22, Graphics.FONT_XTINY, detail, Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
        }

        var foot = loading ? "lädt…" : error != null ? error : age(data);
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.9, Graphics.FONT_XTINY, foot, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function age(data as Dictionary?) as String {
        if (data == null || data["received"] == null) {
            return "";
        }
        var min = (Time.now().value() - (data["received"] as Number)) / 60;
        return min < 1 ? "gerade eben" : min < 60 ? "vor " + min + " Min." : "vor " + (min / 60) + " Std.";
    }
}

class PlantsDelegate extends WatchUi.BehaviorDelegate {
    var view as PlantsView;

    function initialize(v as PlantsView) {
        BehaviorDelegate.initialize();
        view = v;
    }

    function onNextPage() as Boolean {
        view.scroll(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        view.scroll(-1);
        return true;
    }

    function onSelect() as Boolean {
        view.refresh();
        return true;
    }
}
