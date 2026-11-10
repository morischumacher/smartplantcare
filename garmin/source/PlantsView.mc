import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// The plants by urgency, opened from the overview. Each row: a ring filled to the moisture in the
// status colour with the value inside, the name and what to do. Up/down selects, Start (or a tap)
// opens the plant. Data is loaded by the overview.
class PlantsView extends WatchUi.View {
    const ROWS = 4;
    var selected as Number = 0;
    var offset as Number = 0;

    function initialize() {
        View.initialize();
    }

    function rows() as Array {
        return PlantsData.plants(PlantsData.load());
    }

    function move(by as Number) as Void {
        var n = rows().size();
        if (n == 0) {
            return;
        }
        selected = (selected + by + n) % n;
        if (selected < offset) {
            offset = selected;
        } else if (selected >= offset + ROWS) {
            offset = selected - ROWS + 1;
        }
        WatchUi.requestUpdate();
    }

    // index of the row at a tap position, or -1
    function rowAt(y as Numeric) as Number {
        var h = System.getDeviceSettings().screenHeight;
        var i = ((y - h * 0.22) / (h * 0.16)).toNumber();
        return y < h * 0.22 || i >= ROWS || offset + i >= rows().size() ? -1 : offset + i;
    }

    function open(index as Number) as Void {
        var all = rows();
        if (index < 0 || index >= all.size()) {
            return;
        }
        selected = index;
        var item = all[index] as Dictionary;
        if (item["id"] != null) {
            var view = new PlantDetailView(item);
            WatchUi.pushView(view, new PlantDetailDelegate(view), WatchUi.SLIDE_LEFT);
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var all = rows();
        if (selected >= all.size()) {
            selected = 0;
            offset = 0;
        }

        dc.setColor(PlantsData.TEXT, Graphics.COLOR_BLACK);
        dc.clear();
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, "Pflanzen", PlantsData.GREY, PlantsDraw.CENTER);

        var rowH = h * 0.16;
        var top = h * 0.22;
        var r = rowH * 0.36;
        for (var i = 0; i < ROWS && offset + i < all.size(); i++) {
            var item = all[offset + i] as Dictionary;
            var y = top + i * rowH + rowH / 2;
            if (offset + i == selected) {
                dc.setColor(0x1B1A17, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(w * 0.08, y - rowH / 2 + 2, w * 0.84, rowH - 4, rowH / 2 - 2);
            }
            var color = PlantsData.color(item["status"] as String);
            var cx = w * 0.12 + r + 4;
            var m = item["moisture"];
            // moisture ring: track, then the value in the status colour, clockwise from 12 o'clock
            dc.setPenWidth(4);
            dc.setColor(PlantsData.TRACK, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, y, r);
            if (m != null && (m as Numeric) > 0) {
                var deg = (360 * PlantsDraw.clamp((m as Numeric).toFloat() / 100)).toNumber();
                dc.setColor(color, Graphics.COLOR_TRANSPARENT);
                if (deg >= 360) {
                    dc.drawCircle(cx, y, r);
                } else {
                    dc.drawArc(cx, y, r, Graphics.ARC_CLOCKWISE, 90, PlantsDraw.norm(90 - deg));
                }
            }
            dc.setPenWidth(1);
            PlantsDraw.text(dc, cx, y, Graphics.FONT_XTINY, m == null ? "–" : (m as Numeric).format("%d"), m == null ? PlantsData.DIM : PlantsData.TEXT, PlantsDraw.CENTER);

            var x = cx + r + w * 0.04;
            var maxW = w * 0.9 - x;
            PlantsDraw.text(dc, x, y - rowH * 0.19, Graphics.FONT_XTINY, PlantsDraw.fit(dc, item["name"] as String, Graphics.FONT_XTINY, maxW), PlantsData.TEXT, PlantsDraw.LEFT);
            PlantsDraw.text(dc, x, y + rowH * 0.21, Graphics.FONT_XTINY, PlantsDraw.fit(dc, PlantsData.plantLine(item), Graphics.FONT_XTINY, maxW),
                (item["status"] as String).equals("ok") || (item["status"] as String).equals("no_data") ? PlantsData.GREY : color, PlantsDraw.LEFT);
        }
        if (all.size() == 0) {
            PlantsDraw.text(dc, w / 2, h / 2, Graphics.FONT_XTINY, "noch keine Pflanzen", PlantsData.GREY, PlantsDraw.CENTER);
        }
        PlantsDraw.text(dc, w / 2, h * 0.9, Graphics.FONT_XTINY, PlantsDraw.age(PlantsData.load()), PlantsData.DIM, PlantsDraw.CENTER);
    }
}

class PlantsDelegate extends WatchUi.BehaviorDelegate {
    var view as PlantsView;

    function initialize(v as PlantsView) {
        BehaviorDelegate.initialize();
        view = v;
    }

    function onNextPage() as Boolean {
        view.move(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        view.move(-1);
        return true;
    }

    function onSelect() as Boolean {
        view.open(view.selected);
        return true;
    }

    function onTap(evt as WatchUi.ClickEvent) as Boolean {
        var i = view.rowAt(evt.getCoordinates()[1]);
        if (i >= 0) {
            view.open(i);
        }
        return true;
    }
}
