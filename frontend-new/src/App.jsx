import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Dashboard from "./Dashboard.jsx";
import MapView from "./MapView.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8002";
const WS_URL = (() => {
  try {
    const url = new URL(API_BASE);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/events";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "ws://127.0.0.1:8002/ws/events";
  }
})();
const MAX_EVENTS = 1200;

function App() {
  const [events, setEvents] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [routeRequest, setRouteRequest] = useState(null);
  const [latestPothole, setLatestPothole] = useState(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [isDashboardCollapsed, setIsDashboardCollapsed] = useState(false);
  const potholeKeysRef = useRef(new Set());
  const alertTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(900);

  const updateLatestPotholeAlert = useCallback((nextEvents) => {
    const freshPotholes = nextEvents.filter((event) => {
      if (event.event_type !== "pothole") {
        return false;
      }

      const key = `${event.timestamp ?? "no-ts"}-${event.device_id}-${event.lat}-${event.lng}`;
      if (potholeKeysRef.current.has(key)) {
        return false;
      }

      potholeKeysRef.current.add(key);
      return true;
    });

    if (freshPotholes.length > 0) {
      const newestPothole = freshPotholes[freshPotholes.length - 1];
      setLatestPothole(newestPothole);
      setAlertMessage(
        `Live pothole detected at ${Number(newestPothole.lat).toFixed(4)}, ${Number(newestPothole.lng).toFixed(4)}`
      );

      if (alertTimeoutRef.current) {
        window.clearTimeout(alertTimeoutRef.current);
      }

      alertTimeoutRef.current = window.setTimeout(() => {
        setAlertMessage("");
      }, 4000);
    }
  }, []);

  const applyEventSnapshot = useCallback((allEvents) => {
    const normalized = Array.isArray(allEvents) ? allEvents.slice(-MAX_EVENTS) : [];
    setEvents(normalized);
    updateLatestPotholeAlert(normalized);
  }, [updateLatestPotholeAlert]);

  const applySingleEvent = useCallback((event) => {
    if (!event || typeof event !== "object") {
      return;
    }

    setEvents((currentEvents) => {
      const nextEvents = [...currentEvents, event].slice(-MAX_EVENTS);
      updateLatestPotholeAlert(nextEvents);
      return nextEvents;
    });
  }, [updateLatestPotholeAlert]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimeout;
    let socket;

    const connectWebSocket = () => {
      if (cancelled) {
        return;
      }

      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        reconnectDelayRef.current = 900;
      };

      socket.onmessage = (messageEvent) => {
        try {
          const message = JSON.parse(messageEvent.data);

          if (message.type === "snapshot") {
            applyEventSnapshot(message.events);
            return;
          }

          if (message.type === "event_added") {
            applySingleEvent(message.event);
          }
        } catch (error) {
          console.error("Failed to parse websocket message:", error);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }

        reconnectTimeout = window.setTimeout(connectWebSocket, reconnectDelayRef.current);
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 10000);
      };
    };

    const fetchInitialSnapshot = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/events`, { timeout: 2000 });
        if (cancelled) {
          return;
        }

        const snapshotEvents = Array.isArray(res.data.events) ? res.data.events : [];
        applyEventSnapshot(snapshotEvents);
      } catch (error) {
        console.error("Failed to fetch initial events snapshot:", error);
      }
    };

    fetchInitialSnapshot();
    connectWebSocket();

    return () => {
      cancelled = true;
      if (socket && socket.readyState <= 1) {
        socket.close();
      }

      reconnectDelayRef.current = 900;

      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }

      if (alertTimeoutRef.current) {
        window.clearTimeout(alertTimeoutRef.current);
      }
    };
  }, [applyEventSnapshot, applySingleEvent]);

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

    setIsDashboardCollapsed(true);
  };

  const toggleDashboard = () => {
    setIsDashboardCollapsed((isCollapsed) => !isCollapsed);
  };

  return (
    <div className="app-shell">
      <MapView
        events={events}
        activeFilter={activeFilter}
        routeRequest={routeRequest}
        latestPothole={latestPothole}
        showPredictedRiskZones={true}
        isDashboardCollapsed={isDashboardCollapsed}
        onToggleDashboard={toggleDashboard}
      />
      <Dashboard
        stats={stats}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        alertMessage={alertMessage}
        latestPothole={latestPothole}
        onRouteSubmit={handleRouteSubmit}
        isCollapsed={isDashboardCollapsed}
        onToggleCollapse={toggleDashboard}
      />
    </div>
  );
}

export default App;