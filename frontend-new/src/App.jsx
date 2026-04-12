import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Dashboard from "./Dashboard.jsx";
import MapView from "./MapView.jsx";

function App() {
  const [events, setEvents] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [routeRequest, setRouteRequest] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchEvents = async () => {
      try {
        const res = await axios.get("http://127.0.0.1:8000/api/events");
        if (cancelled) {
          return;
        }

        const nextEvents = Array.isArray(res.data.events) ? res.data.events : [];
        setEvents(nextEvents);
      } catch (error) {
        console.error("Failed to fetch events:", error);
      }
    };

    fetchEvents();
    const interval = window.setInterval(fetchEvents, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => {
    const counts = events.reduce(
      (accumulator, event) => {
        if (event.event_type === "pothole") {
          accumulator.potholes += 1;
        } else if (event.event_type === "crash") {
          accumulator.crashes += 1;
        } else if (event.event_type === "speed_breaker") {
          accumulator.speedBreakers += 1;
        }

        return accumulator;
      },
      { potholes: 0, crashes: 0, speedBreakers: 0 }
    );

    return {
      ...counts,
      alerts: counts.potholes + counts.crashes,
      safeRoadPoints: counts.speedBreakers,
    };
  }, [events]);

  const handleRouteSubmit = (start, end) => {
    setRouteRequest({
      start,
      end,
      requestId: Date.now(),
    });
  };

  return (
    <div className="app-shell">
      <MapView events={events} activeFilter={activeFilter} routeRequest={routeRequest} />
      <Dashboard
        stats={stats}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        alertMessage=""
        onRouteSubmit={handleRouteSubmit}
      />
    </div>
  );
}

export default App;