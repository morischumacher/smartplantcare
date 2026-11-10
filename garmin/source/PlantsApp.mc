import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

// Plant overview for the Forerunner 165. A background service fetches the compact `summary`
// every 15 minutes (through the paired phone); the glance and the list view only read Storage.

(:background :glance)
class PlantsApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // 5 minutes is the minimum; plants change slowly, 15 is plenty and saves battery
        if (Background.getTemporalEventRegisteredTime() == null) {
            Background.registerForTemporalEvent(new Time.Duration(15 * 60));
        }
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new OverviewView();
        return [view, new OverviewDelegate(view)];
    }

    (:glance)
    function getGlanceView() as [WatchUi.GlanceView] or [WatchUi.GlanceView, WatchUi.GlanceViewDelegate] or Null {
        return [new PlantsGlance()];
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new PlantsService()];
    }

    // Runs in the foreground with what the background service passed to Background.exit().
    function onBackgroundData(data as Application.PersistableType) as Void {
        if (data instanceof Dictionary) {
            Storage.setValue(PlantsData.KEY, data);
            WatchUi.requestUpdate();
        }
    }
}
