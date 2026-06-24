import { createElement, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { FaCarCrash, FaExclamationTriangle, FaFilter, FaFireAlt, FaRoad } from "react-icons/fa";

const MotionAside = m.aside;
const MotionDiv = m.div;

const filters = [
  { key: "all", label: "All Events", icon: FaFilter },
  { key: "potholes", label: "Potholes", icon: FaExclamationTriangle },
  { key: "crashes", label: "Crashes", icon: FaCarCrash },
  { key: "safe-roads", label: "Safe Roads", icon: FaRoad },
];

function StatCard({ icon, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        {createElement(icon)}
      </div>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard({
  stats,
  activeFilter,
  onFilterChange,
  alertMessage,
  latestPothole,
  onRouteSubmit,
  isCollapsed,
  onToggleCollapse,
}) {
  const [startPoint, setStartPoint] = useState("MG Road, Bengaluru");
  const [endPoint, setEndPoint] = useState("Electronic City, Bengaluru");

  const handleRouteSubmit = (event) => {
    event.preventDefault();
    const start = startPoint.trim();
    const end = endPoint.trim();

    if (!start || !end || !onRouteSubmit) {
      return;
    }

    onRouteSubmit(start, end);
  };

  return (
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
            <StatCard icon={FaExclamationTriangle} label="Potholes" value={stats.potholes} tone="red" />
            <StatCard icon={FaCarCrash} label="Crashes" value={stats.crashes} tone="dark" />
            <StatCard icon={FaFireAlt} label="Alerts" value={stats.alerts} tone="amber" />
            <StatCard icon={FaRoad} label="Safe Points" value={stats.safeRoadPoints} tone="green" />
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

          <form className="route-form" onSubmit={handleRouteSubmit}>
            <p className="section-label">Vehicle Route</p>
            <label className="route-label" htmlFor="start-point">Start</label>
            <input
              id="start-point"
              className="route-input"
              value={startPoint}
              onChange={(event) => setStartPoint(event.target.value)}
              placeholder="Ex: MG Road, Bengaluru or 12.975,77.605"
            />
            <label className="route-label" htmlFor="end-point">Destination</label>
            <input
              id="end-point"
              className="route-input"
              value={endPoint}
              onChange={(event) => setEndPoint(event.target.value)}
              placeholder="Ex: Electronic City, Bengaluru or 12.839,77.678"
            />
            <button className="route-button" type="submit">Move Vehicle On Shortest Route</button>
          </form>

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
  );
}