import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

// First screen when the glance is opened: the situation at a glance (headline and how many
// plants need what), then one card per room with its climate and one card for the plants with
// the next thing to do. Up/down selects a card, Start or a tap opens it.
class OverviewView extends WatchUi.View {
    var selected as Number = -1;
    var loading as Boolean = false;
    var error as String? = null;

    function initialize() {
        View.initialize();
    }

    function onShow() as Void {
        // coming back from a list or detail page: only reload when the data is older than a minute
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

    // up to two rooms, then the plants card (null)
    function cards() as Array {
        var rooms = PlantsData.rooms(PlantsData.load());
        var out = [];
        for (var i = 0; i < rooms.size() && i < 2; i++) {
            out.add(rooms[i]);
        }
        out.add(null);
        return out;
    }

    function move(by as Number) as Void {
        var n = cards().size();
        selected = ((selected < 0 ? n - 1 : selected) + by + n) % n;
        WatchUi.requestUpdate();
    }

    function top() as Float {
        var h = System.getDeviceSettings().screenHeight;
        return cards().size() > 2 ? h * 0.31 : h * 0.36;
    }

    function cardAt(y as Numeric) as Number {
        var h = System.getDeviceSettings().screenHeight;
        var i = ((y - top()) / (h * 0.18)).toNumber();
        return y < top() || i >= cards().size() ? -1 : i;
    }

    function open(index as Number) as Void {
        var all = cards();
        if (index < 0) {
            index = all.size() - 1;
        }
        if (index >= all.size()) {
            return;
        }
        selected = index;
        var room = all[index];
        if (room == null) {
            var view = new PlantsView();
            WatchUi.pushView(view, new PlantsDelegate(view), WatchUi.SLIDE_LEFT);
        } else if ((room as Dictionary)["id"] != null) {
            var view = new RoomView(room as Dictionary);
            WatchUi.pushView(view, new RoomDelegate(view), WatchUi.SLIDE_LEFT);
        }
    }

    // "1 jetzt · 1 bald · 2 ok"
    function counts(data as Dictionary?) as String {
        var parts = [["water_now", "jetzt"], ["water_soon", "bald"], ["ok", "ok"], ["no_data", "ohne Daten"]];
        var out = "";
        for (var i = 0; i < parts.size(); i++) {
            var p = parts[i] as Array;
            var n = PlantsData.countStatus(data, p[0] as String);
            if (n > 0) {
                out = out + (out.length() > 0 ? " · " : "") + n + " " + p[1];
            }
        }
        return out;
    }

    // the next thing to do: the most urgent plant, else the one due soonest
    function nextAction(data as Dictionary?) as String {
        var plants = PlantsData.plants(data);
        var best = null;
        for (var i = 0; i < plants.size(); i++) {
            var p = plants[i] as Dictionary;
            if ((p["status"] as String).equals("water_now")) {
                return (p["name"] as String) + " jetzt gießen";
            }
            var h = p["next_h"];
            if (h != null && (best == null || (h as Number) < ((best as Dictionary)["next_h"] as Number))) {
                best = p;
            }
        }
        if (best == null) {
            return plants.size() == 0 ? "noch keine Pflanzen" : "keine Gieß-Prognose";
        }
        var b = best as Dictionary;
        return (b["name"] as String) + " " + PlantsData.inHours(b["next_h"] as Number?);
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var data = PlantsData.load();
        var all = cards();
        if (selected < 0 || selected >= all.size()) {
            selected = all.size() - 1;
        }

        dc.setColor(PlantsData.TEXT, Graphics.COLOR_BLACK);
        dc.clear();
        var headline = PlantsData.headline(data);
        PlantsDraw.text(dc, w / 2, h * 0.15, Graphics.FONT_SMALL, PlantsDraw.fit(dc, headline, Graphics.FONT_SMALL, w * 0.66), PlantsData.TEXT, PlantsDraw.CENTER);
        PlantsDraw.text(dc, w / 2, h * 0.24, Graphics.FONT_XTINY, PlantsDraw.fit(dc, counts(data), Graphics.FONT_XTINY, w * 0.76), PlantsData.GREY, PlantsDraw.CENTER);

        var cardH = h * 0.18;
        var y0 = top();
        for (var i = 0; i < all.size(); i++) {
            var y = y0 + i * cardH;
            var cy = y + cardH / 2;
            dc.setColor(i == selected ? 0x2A2925 : 0x161512, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(w * 0.1, y + 3, w * 0.8, cardH - 6, w * 0.05);

            var room = all[i];
            var label;
            var value;
            var color;
            if (room == null) {
                var n = PlantsData.plants(data).size();
                label = n == 1 ? "1 Pflanze" : n.toString() + " Pflanzen";
                value = nextAction(data);
                color = PlantsData.plants(data).size() > 0 ? PlantsData.color(((PlantsData.plants(data))[0] as Dictionary)["status"] as String) : PlantsData.GREY;
            } else {
                var r = room as Dictionary;
                label = r["name"] as String;
                value = r["alert"] != null ? r["alert"] as String : PlantsData.roomLine(r);
                color = PlantsData.roomColor(r);
            }
            // colour bar on the left: room climate or the most urgent plant
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(w * 0.15, cy - cardH * 0.25, 5, cardH * 0.5, 2);
            PlantsDraw.text(dc, w * 0.19, cy - cardH * 0.2, Graphics.FONT_XTINY, PlantsDraw.fit(dc, label, Graphics.FONT_XTINY, w * 0.6), PlantsData.GREY, PlantsDraw.LEFT);
            PlantsDraw.text(dc, w * 0.19, cy + cardH * 0.18, Graphics.FONT_XTINY, PlantsDraw.fit(dc, value, Graphics.FONT_XTINY, w * 0.6), PlantsData.TEXT, PlantsDraw.LEFT);
            PlantsDraw.text(dc, w * 0.86, cy, Graphics.FONT_XTINY, "›", PlantsData.DIM, PlantsDraw.RIGHT);
        }

        var foot = loading ? "lädt…" : error != null ? error : PlantsDraw.age(data);
        PlantsDraw.text(dc, w / 2, h * 0.9, Graphics.FONT_XTINY, foot, PlantsData.DIM, PlantsDraw.CENTER);
    }
}

class OverviewDelegate extends WatchUi.BehaviorDelegate {
    var view as OverviewView;

    function initialize(v as OverviewView) {
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
        var i = view.cardAt(evt.getCoordinates()[1]);
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
