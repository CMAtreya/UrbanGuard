import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { FaLocationArrow } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8002";
const MAX_VISIBLE_EVENTS = 500;
const MAX_PREDICTION_POINTS = 120;

const vehicleIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/744/744465.png",
  iconSize: [30, 30],
});

const ROUTE_COLORS = {
  safest: "#22c55e",
  fastest: "#6366f1",
  smoothest: "#f59e0b",
  alternative: "#64748b",
};

const createRouteBadgeIcon = (type, isSelected) => {
  const color = ROUTE_COLORS[type] ?? "#64748b";
  const label = type.toUpperCase();
  return L.divIcon({
    className: "route-badge-marker",
    html: `
      <div style="
        background: ${isSelected ? color : 'rgba(15, 23, 42, 0.85)'};
        color: ${isSelected ? '#fff' : color};
        border: 1px solid ${color};
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 9px;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        transform: translate(-50%, -50%);
        backdrop-filter: blur(2px);
      ">
        ${label}
      </div>
    `,
    iconSize: [0, 0],
  });
};

// Inject custom GPS marker styles
const injectGpsStyles = () => {
  const styleId = "urban-gps-marker-styles";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .gps-user-marker {
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .gps-dot {
      width: 14px;
      height: 14px;
      background-color: #3b82f6;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
      position: relative;
    }
    .gps-pulse {
      position: absolute;
      top: -7px;
      left: -7px;
      width: 24px;
      height: 24px;
      border: 2px solid #60a5fa;
      border-radius: 50%;
      animation: gps-glowing 2s infinite ease-out;
      opacity: 0;
      pointer-events: none;
    }
    @keyframes gps-glowing {
      0% { transform: scale(0.6); opacity: 0.8; }
      100% { transform: scale(1.5); opacity: 0; }
    }
    .no-anomalies-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(96, 165, 250, 0.3);
      border-radius: 16px;
      padding: 20px 32px;
      text-align: center;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      pointer-events: none;
      max-width: 320px;
    }
    .no-anomalies-overlay .icon { font-size: 32px; margin-bottom: 8px; }
    .no-anomalies-overlay .title {
      font-size: 14px;
      font-weight: 700;
      color: #60a5fa;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .no-anomalies-overlay .body {
      font-size: 12px;
      color: rgba(255,255,255,0.65);
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
};

let gpsUserIcon = null;
if (typeof window !== "undefined") {
  injectGpsStyles();
  gpsUserIcon = L.divIcon({
    className: "gps-user-marker",
    html: `<div class="gps-dot"><div class="gps-pulse"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Patch canvas willReadFrequently
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (contextType, options = {}) {
  if (contextType === "2d") options = { ...options, willReadFrequently: true };
  return originalGetContext.call(this, contextType, options);
};

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function HeatOverlay({ points }) {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;
    const heatLayer = L.heatLayer([], {
      radius: 20,
      blur: 15,
      maxZoom: 1,
      gradient: {
        0.15: "#60a5fa",
        0.35: "#34d399",
        0.6: "#f59e0b",
        1: "#ef4444",
      },
    });
    heatLayer.addTo(map);
    heatLayerRef.current = heatLayer;
    return () => {
      if (map && heatLayerRef.current) map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (heatLayerRef.current) heatLayerRef.current.setLatLngs(points);
  }, [points]);

  return null;
}

function MapCenterController({ center, once = false }) {
  const map = useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (!center) return;
    if (once && doneRef.current) return;
    map.setView(center, map.getZoom(), { animate: true, duration: 0.8 });
    doneRef.current = true;
  }, [map, center, once]);

  return null;
}

function parseLatLng(text) {
  const match = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

async function geocodeLocation(query) {
  const response = await fetch(
    `${API_BASE}/api/geocode?query=${encodeURIComponent(query)}`
  );
  if (!response.ok) throw new Error(`Failed to geocode: ${query}`);
  const result = await response.json();
  if (typeof result?.lat !== "number" || typeof result?.lng !== "number")
    throw new Error(`Location not found: ${query}`);
  return [Number(result.lat), Number(result.lng)];
}

async function resolvePoint(input) {
  const parsed = parseLatLng(input);
  return parsed ?? geocodeLocation(input);
}

async function fetchShortestRoute(startText, endText) {
  const [startLat, startLng] = await resolvePoint(startText);
  const [endLat, endLng] = await resolvePoint(endText);
  const routeUrl =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${startLng},${startLat};${endLng},${endLat}` +
    `?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const response = await fetch(routeUrl);
  if (!response.ok) throw new Error("Unable to fetch route from OSRM");
  const data = await response.json();
  const route = data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(route) || route.length === 0)
    throw new Error("No drivable route found between start and destination");
  return route.map(([lng, lat]) => [lat, lng]);
}

function LiveVehicle({ events, routeRequest, analyzedRoutes, selectedRouteIndex }) {
  const map = useMap();
  const [routePath, setRoutePath] = useState([[12.9716, 77.5946]]);
  const [routeError, setRouteError] = useState("");
  const [vehicleIndex, setVehicleIndex] = useState(0);

  const potholeEvents = useMemo(
    () =>
      events
        .filter((e) => e.event_type === "pothole")
        .map((e) => ({ lat: Number(e.lat), lng: Number(e.lng) }))
        .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)),
    [events]
  );

  // Sync routePath with active analyzed route
  useEffect(() => {
    if (analyzedRoutes?.routes?.[selectedRouteIndex]?.waypoints) {
      setRoutePath(analyzedRoutes.routes[selectedRouteIndex].waypoints);
      setVehicleIndex(0);
    }
  }, [analyzedRoutes, selectedRouteIndex]);

  useEffect(() => {
    if (!routeRequest?.start || !routeRequest?.end) return;
    let disposed = false;
    const loadRoute = async () => {
      try {
        setRouteError("");
        const nextRoute = await fetchShortestRoute(routeRequest.start, routeRequest.end);
        if (!disposed) { setRoutePath(nextRoute); setVehicleIndex(0); }
      } catch (error) {
        if (!disposed) setRouteError(error instanceof Error ? error.message : "Failed to build route");
      }
    };
    loadRoute();
    return () => { disposed = true; };
  }, [routeRequest]);

  useEffect(() => {
    if (routePath.length <= 1) return;
    const interval = window.setInterval(() => {
      setVehicleIndex((i) => (i >= routePath.length - 1 ? i : i + 1));
    }, 800);
    return () => window.clearInterval(interval);
  }, [routePath]);

  const position = useMemo(
    () => routePath[Math.min(vehicleIndex, routePath.length - 1)] ?? [12.9716, 77.5946],
    [routePath, vehicleIndex]
  );
  const traveledPath = routePath.slice(0, Math.min(vehicleIndex + 1, routePath.length));

  const distanceMeters = (lat1, lng1, lat2, lng2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const nearestRouteIndex = (lat, lng) => {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < routePath.length; i++) {
      const [rLat, rLng] = routePath[i];
      const d = distanceMeters(lat, lng, rLat, rLng);
      if (d < nearestDistance) { nearestDistance = d; nearestIndex = i; }
    }
    return { nearestIndex, nearestDistance };
  };

  const potholeAheadMessage = (() => {
    if (routePath.length < 2 || potholeEvents.length === 0) return "";
    let nearestAheadDistance = Number.POSITIVE_INFINITY;
    potholeEvents.forEach((e) => {
      const { nearestIndex, nearestDistance } = nearestRouteIndex(e.lat, e.lng);
      if (nearestIndex >= vehicleIndex && nearestIndex <= vehicleIndex + 180 && nearestDistance <= 35) {
        const d = distanceMeters(position[0], position[1], e.lat, e.lng);
        if (d < nearestAheadDistance) nearestAheadDistance = d;
      }
    });
    if (nearestAheadDistance <= 220) {
      const rounded = Math.max(10, Math.round(nearestAheadDistance / 10) * 10);
      return `Go slow. Pothole ahead (~${rounded} m)`;
    }
    return "";
  })();

  useEffect(() => {
    if (!map || routePath.length <= 1) return;
    if (vehicleIndex === 0) {
      map.fitBounds(routePath, { padding: [60, 60], maxZoom: 16 });
      return;
    }
    map.panTo(position, { animate: true, duration: 0.7 });
  }, [map, position, routePath, vehicleIndex]);

  return (
    <>
      <Marker position={position} icon={vehicleIcon}>
        {potholeAheadMessage ? (
          <Tooltip direction="top" offset={[0, -22]} permanent opacity={0.95} className="vehicle-warning-tooltip">
            {potholeAheadMessage}
          </Tooltip>
        ) : null}
      </Marker>
      <Polyline positions={routePath} color="#334155" weight={4} opacity={0.6} />
      <Polyline positions={traveledPath} color="#2563eb" weight={4} />
      {routeError ? (
        <Popup position={position} autoPan={false} closeButton={false} autoClose={false}>
          {routeError}
        </Popup>
      ) : null}
    </>
  );
}

function matchesFilter(event, activeFilter) {
  if (activeFilter === "all") return true;
  if (activeFilter === "potholes") return event.event_type === "pothole";
  if (activeFilter === "crashes") return event.event_type === "crash";
  if (activeFilter === "safe-roads") return event.event_type === "speed_breaker";
  return true;
}

function markerColor(eventType) {
  if (eventType === "pothole") return "#ef4444";
  if (eventType === "crash") return "#111827";
  return "#f59e0b";
}

function predictionToRisk(prediction) {
  return prediction === 1
    ? { label: "Risky road", color: "#ef4444" }
    : { label: "Safe", color: "#22c55e" };
}

// ── Main MapView ─────────────────────────────────────────────────────────────

export default function MapView({
  events,
  activeFilter,
  routeRequest,
  latestPothole,
  showPredictedRiskZones,
  isDashboardCollapsed,
  onToggleDashboard,
  // New GPS props (provided by App.jsx)
  userLocation,       // { lat, lng } | null
  gpsStatus,          // "acquiring" | "locked" | "denied" | "unavailable"
  noAnomalies,        // boolean
  nearbyRadiusM,      // number (default 5000)
  // Route Navigator props
  analyzedRoutes,
  selectedRouteIndex,
  onRouteSelected,
}) {
  const [predictedRiskZones, setPredictedRiskZones] = useState([]);
  const [agentSummary, setAgentSummary] = useState({});
  const predictionCacheRef = useRef(new Map());
  const centeredRef = useRef(false);
  const [reportingLocation, setReportingLocation] = useState(null);

  const handleResolveEvent = async (eventId) => {
    try {
      await fetch(`${API_BASE}/api/events/${eventId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  // Road health and risk grids
  const [showHealthGrid, setShowHealthGrid] = useState(false);
  const [healthGrid, setHealthGrid] = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);

  const [showPredictionHeatmap, setShowPredictionHeatmap] = useState(false);
  const [predictionGrid, setPredictionGrid] = useState([]);
  const [predictionLoading, setPredictionLoading] = useState(false);

  useEffect(() => {
    if (!showHealthGrid || !userLocation) return;
    let active = true;
    const fetchHealthGrid = async () => {
      setHealthLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/analytics/road-health-grid?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=2000&step=300`
        );
        if (res.ok && active) {
          const data = await res.json();
          setHealthGrid(data.grid || []);
        }
      } catch (err) {
        console.error("Failed to fetch road health grid:", err);
      } finally {
        if (active) setHealthLoading(false);
      }
    };
    fetchHealthGrid();
    return () => { active = false; };
  }, [showHealthGrid, userLocation]);

  useEffect(() => {
    if (!showPredictionHeatmap || !userLocation) return;
    let active = true;
    const fetchPredictionGrid = async () => {
      setPredictionLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/ml/prediction-grid?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=2000&step=300`
        );
        if (res.ok && active) {
          const data = await res.json();
          setPredictionGrid(data.grid || []);
        }
      } catch (err) {
        console.error("Failed to fetch prediction grid:", err);
      } finally {
        if (active) setPredictionLoading(false);
      }
    };
    fetchPredictionGrid();
    return () => { active = false; };
  }, [showPredictionHeatmap, userLocation]);

  const fetchAgentSummary = async (lat, lng) => {
    const key = `${lat},${lng}`;
    if (agentSummary[key]) return;
    try {
      const response = await fetch(`${API_BASE}/api/agent/road-summary?lat=${lat}&lng=${lng}`);
      if (!response.ok) throw new Error("HTTP error fetching AI summary");
      const data = await response.json();
      setAgentSummary((prev) => ({ ...prev, [key]: data }));
    } catch {
      setAgentSummary((prev) => ({
        ...prev,
        [key]: {
          summary: "Unable to retrieve real-time road conditions summary.",
          risk_level: "UNKNOWN",
          nearby_events: 0,
          recommendation: "Proceed with elevated caution.",
        },
      }));
    }
  };

  const visibleEvents = useMemo(
    () => events.slice(-MAX_VISIBLE_EVENTS).filter((e) => matchesFilter(e, activeFilter)),
    [activeFilter, events]
  );

  const heatPoints = useMemo(
    () =>
      events
        .filter((e) => e.event_type === "pothole" || e.event_type === "crash")
        .map((e) => [
          Number(e.lat),
          Number(e.lng),
          Math.max(0.35, Math.min(1, Number(e.confidence) || 0.65)),
        ]),
    [events]
  );

  const predictionCandidates = useMemo(() => {
    const seen = new Set();
    const candidates = [];
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      const lat = Number(e.lat);
      const lng = Number(e.lng);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !Number.isFinite(Number(e.ax)) ||
        !Number.isFinite(Number(e.ay)) ||
        !Number.isFinite(Number(e.az)) ||
        !Number.isFinite(Number(e.magnitude))
      ) continue;
      const key = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(e);
      if (candidates.length >= MAX_PREDICTION_POINTS) break;
    }
    return candidates;
  }, [events]);

  useEffect(() => {
    if (!showPredictedRiskZones || predictionCandidates.length === 0) return;
    let cancelled = false;
    const run = async () => {
      const zones = await Promise.all(
        predictionCandidates.map(async (e) => {
          const key = `${Number(e.lat).toFixed(4)},${Number(e.lng).toFixed(4)},${Number(e.confidence).toFixed(2)}`;
          const cached = predictionCacheRef.current.get(key);
          if (cached) return { lat: Number(e.lat), lng: Number(e.lng), ...cached };
          try {
            const ts = e.timestamp ? new Date(e.timestamp) : new Date();
            const params = new URLSearchParams({
              lat: String(e.lat), lng: String(e.lng),
              confidence: String(e.confidence),
              hour: String(ts.getUTCHours()), day: String(ts.getUTCDate()),
            });
            const res = await fetch(`${API_BASE}/predict-road-risk?${params.toString()}`);
            if (!res.ok) return null;
            const data = await res.json();
            const risk = predictionToRisk(Number(data.prediction));
            predictionCacheRef.current.set(key, risk);
            return { lat: Number(e.lat), lng: Number(e.lng), ...risk };
          } catch { return null; }
        })
      );
      if (!cancelled) setPredictedRiskZones(zones.filter(Boolean));
    };
    run();
    return () => { cancelled = true; };
  }, [predictionCandidates, showPredictedRiskZones]);

  // Derived GPS state
  const isGpsLocked = gpsStatus === "locked" && userLocation != null;
  const userCenter = isGpsLocked ? [userLocation.lat, userLocation.lng] : null;
  const radiusM = nearbyRadiusM ?? 5000;

  return (
    <div className="map-stage">
      {/* Floating controls */}
      <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 1000, display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          type="button"
          className={`map-live-toggle ${isDashboardCollapsed ? "collapsed" : "expanded"}`}
          onClick={onToggleDashboard}
          style={{ position: "static" }}
        >
          <span className="live-dot" />
          Live
        </button>

        {/* Toggle buttons for grid layers */}
        {isGpsLocked && (
          <>
            <button
              type="button"
              onClick={() => setShowHealthGrid(prev => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                background: showHealthGrid ? "rgba(34, 197, 94, 0.85)" : "rgba(30, 41, 59, 0.75)",
                border: showHealthGrid ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.1)",
                fontSize: "12px",
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                backdropFilter: "blur(6px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                transition: "all 0.2s",
              }}
            >
              <span>💚</span> {healthLoading ? "Loading..." : "Health Grid"}
            </button>

            <button
              type="button"
              onClick={() => setShowPredictionHeatmap(prev => !prev)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                background: showPredictionHeatmap ? "rgba(167, 139, 250, 0.85)" : "rgba(30, 41, 59, 0.75)",
                border: showPredictionHeatmap ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.1)",
                fontSize: "12px",
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                backdropFilter: "blur(6px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                transition: "all 0.2s",
              }}
            >
              <span>🔮</span> {predictionLoading ? "Loading..." : "Risk Forecast"}
            </button>
          </>
        )}

        {/* GPS status badge — read-only, controlled by App */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 14px",
            borderRadius: "20px",
            background: isGpsLocked
              ? "rgba(37, 99, 235, 0.85)"
              : gpsStatus === "denied" || gpsStatus === "unavailable"
              ? "rgba(220, 38, 38, 0.85)"
              : "rgba(30, 41, 59, 0.75)",
            border: isGpsLocked
              ? "1px solid #3b82f6"
              : gpsStatus === "denied" || gpsStatus === "unavailable"
              ? "1px solid #ef4444"
              : "1px solid rgba(255,255,255,0.1)",
            fontSize: "12px",
            fontWeight: 600,
            color: "#fff",
            backdropFilter: "blur(6px)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            letterSpacing: "0.3px",
          }}
        >
          <FaLocationArrow
            style={{
              fontSize: "10px",
              color: isGpsLocked ? "#60a5fa" : gpsStatus === "denied" ? "#f87171" : "#94a3b8",
              transform: isGpsLocked ? "rotate(45deg)" : "none",
              transition: "transform 0.3s",
            }}
          />
          {gpsStatus === "acquiring" && "Acquiring GPS…"}
          {gpsStatus === "locked" && "GPS Locked"}
          {gpsStatus === "denied" && "GPS Denied"}
          {gpsStatus === "unavailable" && "GPS Unavailable"}
          {gpsStatus === "idle" && "GPS Off"}
        </div>
      </div>

      {/* No anomalies overlay */}
      {noAnomalies && isGpsLocked && (
        <div className="no-anomalies-overlay">
          <div className="icon">✅</div>
          <div className="title">All Clear</div>
          <div className="body">No road anomalies detected near your location.</div>
        </div>
      )}

      <MapContainer
        center={[12.9716, 77.5946]}
        zoom={13}
        scrollWheelZoom
        preferCanvas
        zoomAnimation={false}
        markerZoomAnimation={false}
        fadeAnimation={false}
        className="urban-map"
      >
        <MapClickHandler onMapClick={(lat, lng) => setReportingLocation({ lat, lng })} />

        {reportingLocation && (
          <Marker position={[reportingLocation.lat, reportingLocation.lng]}>
            <Popup closeOnClick={false} onClose={() => setReportingLocation(null)}>
              <div className="report-overlay-form">
                <strong style={{ fontSize: "12px", display: "block", marginBottom: "8px", color: "var(--accent)" }}>
                  📣 Report Incident
                </strong>
                <label style={{ fontSize: "10px", opacity: 0.8, display: "block", marginBottom: "2px" }}>Type</label>
                <select id="report-type">
                  <option value="pothole">Pothole</option>
                  <option value="crash">Crash</option>
                  <option value="speed_breaker">Speed Breaker</option>
                </select>
                
                <label style={{ fontSize: "10px", opacity: 0.8, display: "block", marginBottom: "2px" }}>Severity</label>
                <select id="report-severity">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
                
                <label style={{ fontSize: "10px", opacity: 0.8, display: "block", marginBottom: "2px" }}>Confidence (0.1 - 1.0)</label>
                <input type="number" id="report-confidence" min="0.1" max="1.0" step="0.1" defaultValue="0.9" />

                <button 
                  type="button" 
                  className="submit-btn"
                  onClick={async () => {
                    const type = document.getElementById("report-type").value;
                    const severity = document.getElementById("report-severity").value;
                    const confidence = parseFloat(document.getElementById("report-confidence").value) || 0.9;
                    
                    try {
                      const res = await fetch(`${API_BASE}/api/event`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          lat: reportingLocation.lat,
                          lng: reportingLocation.lng,
                          event_type: type,
                          severity: severity,
                          confidence: confidence,
                          device_id: "web-client",
                          magnitude: type === "pothole" ? 6.5 : 0.0,
                          ax: 0, ay: 0, az: 9.8
                        })
                      });
                      if (res.ok) {
                        setReportingLocation(null);
                      }
                    } catch (err) {
                      console.error("Failed to submit event:", err);
                    }
                  }}
                >
                  Submit Report
                </button>
                <button type="button" className="cancel-btn" onClick={() => setReportingLocation(null)}>
                  Cancel
                </button>
              </div>
            </Popup>
          </Marker>
        )}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          updateWhenIdle={false}
          keepBuffer={2}
        />
        <HeatOverlay points={heatPoints} />
        <LiveVehicle
          events={events}
          routeRequest={routeRequest}
          analyzedRoutes={analyzedRoutes}
          selectedRouteIndex={selectedRouteIndex}
        />

        {/* Draw analyzed route alternatives */}
        {analyzedRoutes?.routes?.map((route, idx) => {
          const isSelected = idx === selectedRouteIndex;
          const type = route.type;
          const color = ROUTE_COLORS[type] ?? "#64748b";
          return (
            <Polyline
              key={`analyzed-route-${type}-${idx}`}
              positions={route.waypoints}
              color={color}
              weight={isSelected ? 6 : 3.5}
              opacity={isSelected ? 0.95 : 0.35}
              eventHandlers={{
                click: () => {
                  if (onRouteSelected) onRouteSelected(idx);
                }
              }}
            />
          );
        })}

        {/* Route type badge labels */}
        {analyzedRoutes?.routes?.map((route, idx) => {
          const isSelected = idx === selectedRouteIndex;
          const type = route.type;
          const midIndex = Math.floor(route.waypoints.length / 2);
          const midPoint = route.waypoints[midIndex];
          if (!midPoint) return null;
          return (
            <Marker
              key={`route-badge-${type}-${idx}`}
              position={midPoint}
              icon={createRouteBadgeIcon(type, isSelected)}
              eventHandlers={{
                click: () => {
                  if (onRouteSelected) onRouteSelected(idx);
                }
              }}
            />
          );
        })}

        {/* Road Health Grid Circles */}
        {showHealthGrid && healthGrid.map((pt, i) => {
          let color = "#22c55e"; // Excellent
          if (pt.score < 40) color = "#ef4444"; // Dangerous
          else if (pt.score < 70) color = "#f59e0b"; // Moderate
          else if (pt.score < 90) color = "#84cc16"; // Good
          return (
            <Circle
              key={`health-${pt.lat}-${pt.lng}-${i}`}
              center={[pt.lat, pt.lng]}
              radius={150}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.15,
                weight: 1,
                dashArray: "3 3",
              }}
            >
              <Tooltip>
                <div style={{ fontFamily: "sans-serif", fontSize: "11px" }}>
                  <b>Road Health Score</b>
                  <br />
                  Score: {pt.score} ({pt.grade})
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* Risk Prediction Heatmap Markers */}
        {showPredictionHeatmap && predictionGrid.map((pt, i) => {
          let color = "#22c55e";
          if (pt.risk_score > 0.7) color = "#ef4444";
          else if (pt.risk_score >= 0.3) color = "#f59e0b";
          return (
            <CircleMarker
              key={`pred-heat-${pt.lat}-${pt.lng}-${i}`}
              center={[pt.lat, pt.lng]}
              radius={6}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.75,
                weight: 1,
              }}
            >
              <Popup>
                <div style={{ fontFamily: "sans-serif", fontSize: "11px" }}>
                  <b>Road Risk Prediction</b>
                  <br />
                  Risk Level: <b style={{ color }}>{pt.risk_level}</b>
                  <br />
                  Risk Score: {(pt.risk_score * 100).toFixed(0)}%
                  <br />
                  Recent incidents: {pt.event_count}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Center map once when GPS is first locked */}
        {userCenter && !centeredRef.current && (
          <MapCenterController center={userCenter} once />
        )}

        {/* User GPS marker + radius circle */}
        {isGpsLocked && (
          <>
            <Marker position={userCenter} icon={gpsUserIcon}>
              <Popup>
                <div style={{ fontFamily: "sans-serif", fontSize: "12px" }}>
                  <b>Your GPS Location</b>
                  <br />
                  {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                  <br />
                  <span style={{ opacity: 0.7 }}>Tracking: Active</span>
                </div>
              </Popup>
            </Marker>

            {/* 5 km radius circle */}
            <Circle
              center={userCenter}
              radius={radiusM}
              pathOptions={{
                color: "#3b82f6",
                fillColor: "#3b82f6",
                fillOpacity: 0.05,
                weight: 1.5,
                dashArray: "6 4",
              }}
            />
          </>
        )}

        {/* Latest live pothole pulse */}
        {latestPothole ? (
          <CircleMarker
            center={[Number(latestPothole.lat), Number(latestPothole.lng)]}
            radius={12}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.25, weight: 3 }}
          >
            <Tooltip direction="top" offset={[0, -18]} permanent opacity={0.95} className="vehicle-warning-tooltip">
              Live pothole detected
            </Tooltip>
          </CircleMarker>
        ) : null}

        {/* Predicted risk zones */}
        {showPredictedRiskZones && events.length > 0
          ? predictedRiskZones.map((zone, index) => (
              <CircleMarker
                key={`risk-${zone.lat}-${zone.lng}-${index}`}
                center={[zone.lat, zone.lng]}
                radius={7}
                pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.18, weight: 1 }}
              >
                <Popup>
                  <b>Predicted Risk Zone</b>
                  <br />
                  {zone.label}
                </Popup>
              </CircleMarker>
            ))
          : null}

        {/* Anomaly markers from backend */}
        {visibleEvents.map((event, i) => {
          const key = `${event.lat},${event.lng}`;
          const summary = agentSummary[key];
          return (
            <CircleMarker
              key={`${event.device_id ?? "device"}-${event.event_type}-${event.lat}-${event.lng}-${i}`}
              center={[event.lat, event.lng]}
              radius={5}
              pathOptions={{
                color: markerColor(event.event_type),
                fillColor: markerColor(event.event_type),
                fillOpacity: 0.85,
                weight: 2,
              }}
              eventHandlers={{ click: () => fetchAgentSummary(event.lat, event.lng) }}
            >
              <Popup>
                <div style={{ minWidth: 220, fontFamily: "sans-serif", padding: "4px" }}>
                  <strong style={{ fontSize: "13px", color: "var(--accent, #f59e0b)", display: "flex", gap: "4px", alignItems: "center" }}>
                    📍 Road Segment
                  </strong>
                  <span style={{ fontSize: "11px", opacity: 0.8, display: "block", marginTop: "2px" }}>
                    Type: <b style={{ textTransform: "capitalize" }}>{event.event_type}</b> (Conf: {(event.confidence * 100).toFixed(0)}%)
                  </span>
                  {event.distance_m != null && (
                    <span style={{ fontSize: "11px", opacity: 0.65, display: "block" }}>
                      Distance: {event.distance_m < 1000
                        ? `${event.distance_m} m`
                        : `${(event.distance_m / 1000).toFixed(1)} km`}
                    </span>
                  )}
                  <hr style={{ margin: "8px 0", borderColor: "rgba(255,255,255,0.1)" }} />
                  {summary ? (
                    <div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{
                          fontSize: "10px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px",
                          background: summary.risk_level === "HIGH" ? "rgba(239,68,68,0.2)" : summary.risk_level === "MEDIUM" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)",
                          color: summary.risk_level === "HIGH" ? "#ef4444" : summary.risk_level === "MEDIUM" ? "#f59e0b" : "#22c55e",
                        }}>
                          Risk: {summary.risk_level}
                        </span>
                        <span style={{ fontSize: "11px", opacity: 0.7 }}>Nearby: {summary.nearby_events} events</span>
                      </div>
                      <p style={{ fontSize: "11px", margin: "0 0 6px 0", lineHeight: "1.4" }}>
                        <b>AI Summary:</b><br />{summary.summary}
                      </p>
                      <p style={{ fontSize: "11px", margin: 0, color: "#60a5fa" }}>
                        <b>Recommendation:</b><br />{summary.recommendation}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <p style={{ fontSize: "11px", opacity: 0.6, margin: 0 }}>Click to load AI summary…</p>
                      <div style={{ height: "10px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", width: "100%" }} />
                      <div style={{ height: "10px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", width: "60%" }} />
                    </div>
                  )}
                  {event.id && (
                    <button 
                      type="button" 
                      className="resolve-btn"
                      onClick={() => handleResolveEvent(event.id)}
                    >
                      Resolve Incident
                    </button>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}