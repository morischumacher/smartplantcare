import Toybox.Background;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

// Background service: fetches the summary and hands it to the app via Background.exit().
(:background)
class PlantsService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() as Void {
        PlantsData.fetch(method(:onReceive));
    }

    function onReceive(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (responseCode == 200 && data instanceof Dictionary) {
            Background.exit(PlantsData.slim(data));
        } else {
            Background.exit(null);
        }
    }
}
