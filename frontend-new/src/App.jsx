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
const NEARBY_RADIUS_M = 5000;
const REFRESH_INTERVAL_MS = 30_000;

// ─── GPS Status constants ────────────────────────────────────────────────────
const GPS_STATUS = {
  ACQUIRING: "acquiring",
  LOCKED: "locked",
  DENIED: "denied",
  UNAVAILABLE: "unavailable",
  IDLE: "idle",
};

// ─── Haversine distance (mirrors backend, used for WS merge) ─────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function App() {
  const [events, setEvents] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [routeRequest, setRouteRequest] = useState(null);
  const [latestPothole, setLatestPothole] = useState(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [isDashboardCollapsed, setIsDashboardCollapsed] = useState(false);

  // GPS + nearby state
  const [userLocation, setUserLocation] = useState(null); // { lat, lng }
  const [gpsStatus, setGpsStatus] = useState(GPS_STATUS.ACQUIRING);
  const [nearbyStats, setNearbyStats] = useState(null);
  const [noAnomalies, setNoAnomalies] = useState(false);

  // Route analysis state
  const [analyzedRoutes, setAnalyzedRoutes] = useState(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  const potholeKeysRef = useRef(new Set());
  const alertTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(900);
  const userLocationRef = useRef(null); // always-current copy for interval callback

  // Keep ref in sync
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // ── Pothole alert helper ─────────────────────────────────────────────────
  const updateLatestPotholeAlert = useCallback((nextEvents) => {
    const freshPotholes = nextEvents.filter((event) => {
      if (event.event_type !== "pothole") return false;
      const key = `${event.timestamp ?? "no-ts"}-${event.device_id}-${event.lat}-${event.lng}`;
      if (potholeKeysRef.current.has(key)) return false;
      potholeKeysRef.current.add(key);
      return true;
    });

    if (freshPotholes.length > 0) {
      const newestPothole = freshPotholes[freshPotholes.length - 1];
      setLatestPothole(newestPothole);
      setAlertMessage(
        `Live pothole detected at ${Number(newestPothole.lat).toFixed(4)}, ${Number(newestPothole.lng).toFixed(4)}`
      );

      if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = window.setTimeout(() => {
        setAlertMessage("");
      }, 4000);
    }
  }, []);

  // ── Nearby fetch from backend ─────────────────────────────────────────────
  const fetchNearbyEvents = useCallback(async (lat, lng) => {
    try {
      const res = await axios.get(`${API_BASE}/api/events/nearby`, {
        params: { lat, lng, radius: NEARBY_RADIUS_M },
        timeout: 8000,
      });
      const { events: nearbyEvents, count, type_counts, no_anomalies, radius_m, message } =
        res.data;

      const normalized = Array.isArray(nearbyEvents)
        ? nearbyEvents.slice(-MAX_EVENTS)
        : [];

      setEvents(normalized);
      setNoAnomalies(!!no_anomalies);
      setNearbyStats({
        count: count ?? normalized.length,
        radius_m: radius_m ?? NEARBY_RADIUS_M,
        type_counts: type_counts ?? {},
        message: message ?? "",
      });
      updateLatestPotholeAlert(normalized);
    } catch (err) {
      console.error("Failed to fetch nearby events:", err);
    }
  }, [updateLatestPotholeAlert]);

  // ── GPS: request on startup ───────────────────────────────────────────────
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus(GPS_STATUS.UNAVAILABLE);
      return;
    }

    setGpsStatus(GPS_STATUS.ACQUIRING);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const newLoc = { lat, lng };
        setUserLocation(newLoc);
        setGpsStatus(GPS_STATUS.LOCKED);
        fetchNearbyEvents(lat, lng);
      },
      (err) => {
        console.error("GPS error:", err);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus(GPS_STATUS.DENIED);
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsStatus(GPS_STATUS.UNAVAILABLE);
        } else {
          setGpsStatus(GPS_STATUS.UNAVAILABLE);
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [fetchNearbyEvents]);

  // ── 30-second auto-refresh ────────────────────────────────────────────────
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const loc = userLocationRef.current;
      if (loc) {
        fetchNearbyEvents(loc.lat, loc.lng);
      }
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchNearbyEvents]);

  // ── WebSocket: merge live events into nearby set ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    let reconnectTimeout;
    let socket;

    const connectWebSocket = () => {
      if (cancelled) return;
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        reconnectDelayRef.current = 900;
      };

      socket.onmessage = (messageEvent) => {
        try {
          const message = JSON.parse(messageEvent.data);

          if (message.type === "snapshot") {
            // Snapshot is only used as fallback when GPS is not locked yet
            if (gpsStatus !== GPS_STATUS.LOCKED) {
              const snapshotEvents = Array.isArray(message.events)
                ? message.events.slice(-MAX_EVENTS)
                : [];
              setEvents(snapshotEvents);
              updateLatestPotholeAlert(snapshotEvents);
            }
            return;
          }

          if (message.type === "event_deleted") {
            setEvents((cur) => cur.filter((e) => e.id !== message.id && String(e.id) !== String(message.id)));
            const loc = userLocationRef.current;
            if (loc) {
              fetchNearbyEvents(loc.lat, loc.lng);
            }
            return;
          }

          if (message.type === "event_added" && message.event) {
            const event = message.event;
            const loc = userLocationRef.current;

            // Only add to visible set if within radius (or GPS not yet locked)
            if (!loc) {
              setEvents((cur) => {
                const next = [...cur, event].slice(-MAX_EVENTS);
                updateLatestPotholeAlert(next);
                return next;
              });
              return;
            }

            const dist = haversineMeters(
              loc.lat,
              loc.lng,
              Number(event.lat),
              Number(event.lng)
            );

            if (dist <= NEARBY_RADIUS_M) {
              const enriched = { ...event, distance_m: Math.round(dist) };
              setEvents((cur) => {
                const next = [...cur, enriched].slice(-MAX_EVENTS);
                updateLatestPotholeAlert(next);
                setNearbyStats((prev) => ({
                  ...(prev ?? {}),
                  count: next.length,
                  type_counts: {
                    ...(prev?.type_counts ?? {}),
                    [event.event_type]:
                      ((prev?.type_counts ?? {})[event.event_type] ?? 0) + 1,
                  },
                }));
                setNoAnomalies(false);
                return next;
              });
            }
          }
        } catch (error) {
          console.error("Failed to parse websocket message:", error);
        }
      };

      socket.onerror = () => { socket?.close(); };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimeout = window.setTimeout(
          connectWebSocket,
          reconnectDelayRef.current
        );
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 1.5,
          10000
        );
      };
    };

    connectWebSocket();

    return () => {
      cancelled = true;
      if (socket && socket.readyState <= 1) socket.close();
      reconnectDelayRef.current = 900;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current);
    };
  }, [gpsStatus, updateLatestPotholeAlert]);

  // ── Stats derived from current visible events ─────────────────────────────
  const stats = useMemo(() => {
    const counts = events.reduce(
      (acc, event) => {
        if (event.event_type === "pothole") acc.potholes += 1;
        else if (event.event_type === "crash") acc.crashes += 1;
        else if (event.event_type === "speed_breaker") acc.speedBreakers += 1;
        return acc;
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
    setRouteRequest({ start, end, requestId: Date.now() });
    setIsDashboardCollapsed(true);
  };

  const toggleDashboard = () => {
    setIsDashboardCollapsed((c) => !c);
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
        userLocation={userLocation}
        gpsStatus={gpsStatus}
        noAnomalies={noAnomalies}
        nearbyRadiusM={NEARBY_RADIUS_M}
        analyzedRoutes={analyzedRoutes}
        selectedRouteIndex={selectedRouteIndex}
        onRouteSelected={setSelectedRouteIndex}
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
        nearbyStats={nearbyStats}
        gpsStatus={gpsStatus}
        noAnomalies={noAnomalies}
        analyzedRoutes={analyzedRoutes}
        onRoutesAnalyzed={setAnalyzedRoutes}
        onRouteSelected={setSelectedRouteIndex}
      />
    </div>
  );
}

export default App;