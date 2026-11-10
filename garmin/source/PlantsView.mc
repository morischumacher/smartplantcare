import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

// Opened from the glance: the rooms with their climate on top, then the plants by urgency, each
// with a status dot, what to do and the moisture. Up/down selects, Start (or a tap) opens the
// room or plant.
class PlantsView extends WatchUi.View {
    const ROWS = 4;
    var selected as Number = 0;
    var offset as Number = 0;
    var loading as Boolean = false;
    var error as String? = null;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        // coming back from a detail page: only reload when the data is older than a minute
        var data = PlantsData.load();
        if (data == null || data["received"] == null || Time.now().value() - (data["received"] as Number) > 60) {
            refresh();
        }
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
            error = PlantsDraw.errorText(responseCode);
        }
        WatchUi.requestUpdate();
    }

    // rooms first, then plants; each row is [kind, data]
    function rows() as Array {
        var data = PlantsData.load();
        var out = [];
        var rooms = PlantsData.rooms(data);
        for (var i = 0; i < rooms.size(); i++) {
            out.add(["room", rooms[i]]);
        }
        var plants = PlantsData.plants(data);
        for (var i = 0; i < plants.size(); i++) {
            out.add(["plant", plants[i]]);
        }
        return out;
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
        var i = ((y - h * 0.24) / (h * 0.15)).toNumber();
        var n = rows().size();
        return y < h * 0.24 || i >= ROWS || offset + i >= n ? -1 : offset + i;
    }

    function open(index as Number) as Void {
        var all = rows();
        if (index < 0 || index >= all.size()) {
            return;
        }
        selected = index;
        var row = all[index] as Array;
        var item = row[1] as Dictionary;
        if (item["id"] == null) {
            return;
        }
        if ((row[0] as String).equals("room")) {
            var view = new RoomView(item);
            WatchUi.pushView(view, new RoomDelegate(view), WatchUi.SLIDE_LEFT);
        } else {
            var view = new PlantDetailView(item);
            WatchUi.pushView(view, new PlantDetailDelegate(view), WatchUi.SLIDE_LEFT);
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var data = PlantsData.load();
        var all = rows();
        if (selected >= all.size()) {
            selected = 0;
            offset = 0;
        }

        dc.setColor(PlantsData.TEXT, Graphics.COLOR_BLACK);
        dc.clear();
        PlantsDraw.text(dc, w / 2, h * 0.13, Graphics.FONT_XTINY, PlantsData.headline(data), PlantsData.GREY, PlantsDraw.CENTER);

        var rowH = h * 0.15;
        var top = h * 0.24;
        for (var i = 0; i < ROWS && offset + i < all.size(); i++) {
            var row = all[offset + i] as Array;
            var item = row[1] as Dictionary;
            var isRoom = (row[0] as String).equals("room");
            var y = top + i * rowH + rowH / 2;
            if (offset + i == selected) {
                dc.setColor(0x1B1A17, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(w * 0.08, y - rowH / 2 + 2, w * 0.84, rowH - 4, rowH / 2 - 2);
            }
            var color = isRoom ? PlantsData.roomColor(item) : PlantsData.color(item["status"] as String);
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(w * 0.15, y, 7);

            var right = w * 0.86;
            if (!isRoom && item["moisture"] != null) {
                var m = (item["moisture"] as Numeric).format("%d") + " %";
                PlantsDraw.text(dc, right, y, Graphics.FONT_TINY, m, color, PlantsDraw.RIGHT);
                right -= dc.getTextWidthInPixels(m, Graphics.FONT_TINY) + w * 0.03;
            }
            var maxW = right - w * 0.21;
            var name = PlantsDraw.fit(dc, item["name"] as String, Graphics.FONT_XTINY, maxW);
            var line = isRoom ? (item["alert"] != null ? item["alert"] as String : PlantsData.roomLine(item)) : PlantsData.plantLine(item);
            PlantsDraw.text(dc, w * 0.21, y - rowH * 0.2, Graphics.FONT_XTINY, name, PlantsData.TEXT, PlantsDraw.LEFT);
            PlantsDraw.text(dc, w * 0.21, y + rowH * 0.22, Graphics.FONT_XTINY, PlantsDraw.fit(dc, line, Graphics.FONT_XTINY, maxW),
                isRoom && item["alert"] != null ? color : PlantsData.GREY, PlantsDraw.LEFT);
        }

        var foot = loading ? "lädt…" : error != null ? error : age(data);
        PlantsDraw.text(dc, w / 2, h * 0.9, Graphics.FONT_XTINY, foot, PlantsData.DIM, PlantsDraw.CENTER);
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

    // long press / menu: reload now
    function onMenu() as Boolean {
        view.refresh();
        return true;
    }
}
