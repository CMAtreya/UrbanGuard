import { createElement, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FaCarCrash, FaExclamationTriangle, FaFilter, FaFireAlt, FaRoad, FaInfoCircle, FaLocationArrow, FaMapMarkerAlt, FaFilePdf } from "react-icons/fa";
import MLStatsCard from "./MLStatsCard.jsx";
import RouteAnalyzer from "./RouteAnalyzer.jsx";
import AnalyticsPanel from "./AnalyticsPanel.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8002";
const MotionAside = motion.aside;
const MotionDiv = motion.div;

const filters = [
  { key: "all", label: "All Events", icon: FaFilter },
  { key: "potholes", label: "Potholes", icon: FaExclamationTriangle },
  { key: "crashes", label: "Crashes", icon: FaCarCrash },
  { key: "safe-roads", label: "Safe Roads", icon: FaRoad },
];

function StatCard({ icon, label, value, tone }) {
  const isLoaded = value !== undefined && value !== null;
  return (
    <div className={`stat-card ${!isLoaded ? "skeleton" : ""}`}>
      <div className={`stat-icon ${tone}`}>
        {createElement(icon)}
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{isLoaded ? value : "..."}</p>
      </div>
    </div>
  );
}

// GPS status label/color helpers
const GPS_LABEL = {
  acquiring: { text: "Acquiring…", color: "#f59e0b" },
  locked:    { text: "Locked",     color: "#22c55e" },
  denied:    { text: "Denied",     color: "#ef4444" },
  unavailable: { text: "Unavailable", color: "#ef4444" },
  idle:      { text: "Off",        color: "#64748b" },
};

export default function Dashboard({
  stats,
  activeFilter,
  onFilterChange,
  alertMessage,
  latestPothole,
  onRouteSubmit,
  isCollapsed,
  onToggleCollapse,
  // New GPS / nearby props
  nearbyStats,   // { count, radius_m, type_counts, message }
  gpsStatus,     // "acquiring" | "locked" | "denied" | "unavailable"
  noAnomalies,   // boolean
  // Route analysis props
  analyzedRoutes,
  onRoutesAnalyzed,
  onRouteSelected,
}) {
  const [startPoint, setStartPoint] = useState("MG Road, Bengaluru");
  const [endPoint, setEndPoint] = useState("Electronic City, Bengaluru");
  const [mlStats, setMlStats] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/ml-stats`);
        if (response.ok && active) {
          const data = await response.json();
          setMlStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch ML stats", err);
      }
    };
    fetchStats();
    return () => {
      active = false;
    };
  }, []);

  // Listen to alertMessage changes to show a system toast
  useEffect(() => {
    if (alertMessage) {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, text: alertMessage, type: "warning" }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alertMessage]);

  const handleRouteSubmit = (event) => {
    event.preventDefault();
    const start = startPoint.trim();
    const end = endPoint.trim();

    if (!start || !end || !onRouteSubmit) {
      return;
    }

    onRouteSubmit(start, end);
    // Show toast for routing action
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text: `Routing vehicle from ${start} to ${end}...`, type: "info" }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  return (
    <>
      {/* Toast Notification Container */}
      <div 
        style={{ 
          position: "fixed", 
          top: "20px", 
          right: "20px", 
          zIndex: 9999, 
          display: "flex", 
          flexDirection: "column", 
          gap: "10px", 
          pointerEvents: "none" 
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <m.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              style={{
                background: t.type === "warning" ? "rgba(239, 68, 68, 0.95)" : "rgba(30, 41, 59, 0.95)",
                color: "#fff",
                padding: "12px 20px",
                borderRadius: "8px",
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                borderLeft: t.type === "warning" ? "4px solid #f87171" : "4px solid #60a5fa",
                backdropFilter: "blur(4px)",
                pointerEvents: "auto",
                maxWidth: "350px"
              }}
            >
              <FaInfoCircle />
              <span>{t.text}</span>
            </m.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!isCollapsed ? (
          <MotionAside
            key="dashboard-expanded"
            className="dashboard-panel"
            initial={{ x: -34, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -36, opacity: 0 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            <div className="dashboard-header">
              <div>
                <p className="eyebrow"></p>
                <h1 className="dashboard-title">UrbanGuard</h1>
                <p className="dashboard-copy">
                  Live IoT simulation, danger heatmap, and smart incident filtering in one glass panel.
                </p>
              </div>

              <button
                type="button"
                className="live-pill"
                onClick={onToggleCollapse}
              >
                <span className="live-dot" />
                Live
              </button>
            </div>

            <div className="dashboard-grid">
              <StatCard icon={FaExclamationTriangle} label="Potholes" value={stats?.potholes} tone="red" />
              <StatCard icon={FaCarCrash} label="Crashes" value={stats?.crashes} tone="dark" />
              <StatCard icon={FaFireAlt} label="Alerts" value={stats?.alerts} tone="amber" />
              <StatCard icon={FaRoad} label="Safe Points" value={stats?.safeRoadPoints} tone="green" />
            </div>

            <div className="live-detection-card">
              <div className="live-detection-title">
                <span className="live-dot" />
                Live Pothole Detection
              </div>
              {latestPothole ? (
                <p className="live-detection-body">
                  Detected near {Number(latestPothole.lat).toFixed(4)}, {Number(latestPothole.lng).toFixed(4)}
                  <br />
                  Confidence: {Number(latestPothole.confidence).toFixed(2)}
                </p>
              ) : (
                <p className="live-detection-body">Waiting for live pothole data...</p>
              )}
            </div>

            {/* GPS & Nearby Anomalies panel */}
            <div
              style={{
                marginTop: "16px",
                padding: "14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* GPS status row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <p className="section-label" style={{ margin: 0, fontSize: "11px", fontWeight: "600" }}>
                  📡 GPS & Nearby
                </p>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "20px",
                    background: "rgba(255,255,255,0.05)",
                    color: GPS_LABEL[gpsStatus ?? "idle"]?.color ?? "#64748b",
                    border: `1px solid ${GPS_LABEL[gpsStatus ?? "idle"]?.color ?? "#64748b"}44`,
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <FaLocationArrow style={{ fontSize: "9px" }} />
                  {GPS_LABEL[gpsStatus ?? "idle"]?.text ?? "Off"}
                </span>
              </div>

              {/* Nearby stats */}
              {nearbyStats ? (
                <>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                    <div style={{
                      flex: 1, minWidth: "80px",
                      background: "rgba(59,130,246,0.08)",
                      border: "1px solid rgba(59,130,246,0.2)",
                      borderRadius: "8px",
                      padding: "8px",
                      textAlign: "center",
                    }}>
                      <p style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#60a5fa" }}>
                        {nearbyStats.count}
                      </p>
                      <p style={{ margin: 0, fontSize: "10px", opacity: 0.65 }}>Anomalies</p>
                    </div>
                    <div style={{
                      flex: 1, minWidth: "80px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                      padding: "8px",
                      textAlign: "center",
                    }}>
                      <p style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#a78bfa" }}>
                        {(nearbyStats.radius_m / 1000).toFixed(1)}
                      </p>
                      <p style={{ margin: 0, fontSize: "10px", opacity: 0.65 }}>km radius</p>
                    </div>
                  </div>

                  {/* Per-type breakdown */}
                  {Object.entries(nearbyStats.type_counts ?? {}).length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {Object.entries(nearbyStats.type_counts).map(([type, count]) => (
                        <div
                          key={type}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: "11px",
                            padding: "3px 6px",
                            borderRadius: "6px",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          <span style={{ textTransform: "capitalize", opacity: 0.75 }}>
                            {type === "speed_breaker" ? "Speed Breaker" : type.charAt(0).toUpperCase() + type.slice(1)}
                          </span>
                          <span style={{
                            fontWeight: 700,
                            color: type === "pothole" ? "#ef4444" : type === "crash" ? "#f87171" : "#f59e0b",
                          }}>
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {noAnomalies && (
                    <p style={{ fontSize: "11px", color: "#22c55e", margin: "8px 0 0 0", display: "flex", alignItems: "center", gap: "5px" }}>
                      <FaMapMarkerAlt /> No anomalies within {(nearbyStats.radius_m / 1000).toFixed(1)} km
                    </p>
                  )}
                </>
              ) : (
                <p style={{ fontSize: "11px", opacity: 0.45, margin: 0 }}>
                  {gpsStatus === "acquiring" ? "Waiting for GPS fix…" :
                   gpsStatus === "denied" ? "Enable location access to see nearby anomalies." :
                   gpsStatus === "unavailable" ? "GPS not available on this device." :
                   "GPS inactive."}
                </p>
              )}
            </div>

            {/* ML statistics panel card */}
            <MLStatsCard mlStats={mlStats} />

            <div className="filters-block">
              <p className="section-label">Filters</p>
              <div className="filter-row">
                {filters.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip ${activeFilter === key ? "active" : ""}`}
                    onClick={() => onFilterChange(key)}
                  >
                    {createElement(icon)}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Safe Route Navigator */}
            <RouteAnalyzer
              analyzedRoutes={analyzedRoutes}
              onRoutesAnalyzed={onRoutesAnalyzed}
              onRouteSelected={onRouteSelected}
            />

            {/* Analytics Dashboard Panel */}
            <AnalyticsPanel />

            {/* PDF Report Generation Button */}
            <div style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="route-button"
                onClick={() => window.open(`${API_BASE}/api/reports/road-condition`)}
                style={{
                  background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  fontWeight: "600",
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)",
                }}
              >
                <FaFilePdf style={{ fontSize: "14px" }} /> Download PDF Road Report
              </button>
            </div>

            {/* Map Legend */}
            <div 
              className="legend-block" 
              style={{ 
                marginTop: "16px", 
                padding: "12px", 
                background: "rgba(255, 255, 255, 0.02)", 
                borderRadius: "12px", 
                border: "1px solid rgba(255, 255, 255, 0.04)" 
              }}
            >
              <p className="section-label" style={{ marginBottom: "8px", fontSize: "11px", fontWeight: "600" }}>Map Legend</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                  <span>Pothole</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#111827", border: "1px solid rgba(255,255,255,0.4)", display: "inline-block" }} />
                  <span>Crash</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                  <span>Speed Breaker</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  <span>Safe Prediction</span>
                </div>
              </div>
            </div>

            {alertMessage ? (
              <MotionDiv
                className="alert-banner"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {alertMessage}
              </MotionDiv>
            ) : null}

            <p className="dashboard-note">
              Heatmap highlights potholes and crashes. “Safe Roads” currently shows lower-risk speed breaker points.
            </p>
          </MotionAside>
        ) : null}
      </AnimatePresence>
    </>
  );
}