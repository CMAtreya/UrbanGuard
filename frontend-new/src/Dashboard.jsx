import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FaCarCrash, FaExclamationTriangle, FaFilter, FaFireAlt, FaRoad, FaSatelliteDish } from "react-icons/fa";

const filters = [
  { key: "all", label: "All Events", icon: FaFilter },
  { key: "potholes", label: "Potholes", icon: FaExclamationTriangle },
  { key: "crashes", label: "Crashes", icon: FaCarCrash },
  { key: "safe-roads", label: "Safe Roads", icon: FaRoad },
];

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon />
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
  showPredictedRiskZones,
  onTogglePredictedRiskZones,
  alertMessage,
  onRouteSubmit,
}) {
  const [startPoint, setStartPoint] = useState("MG Road, Bengaluru");
  const [endPoint, setEndPoint] = useState("Electronic City, Bengaluru");
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleRouteSubmit = (event) => {
    event.preventDefault();
    const start = startPoint.trim();
    const end = endPoint.trim();

    if (!start || !end || !onRouteSubmit) {
      return;
    }

    onRouteSubmit(start, end);
    setIsCollapsed(true);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isCollapsed ? (
        <motion.button
          key="dashboard-collapsed"
          type="button"
          className="dashboard-live-toggle"
          onClick={() => setIsCollapsed(false)}
          initial={{ x: -34, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -20, opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <span className="live-dot" />
          Live
        </motion.button>
      ) : (
        <motion.aside
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
              onClick={() => setIsCollapsed(true)}
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

          <div className="filters-block">
            <p className="section-label">Filters</p>
            <div className="filter-row">
              {filters.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${activeFilter === key ? "active" : ""}`}
                  onClick={() => onFilterChange(key)}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
              <button
                type="button"
                className={`filter-chip ${showPredictedRiskZones ? "active" : ""}`}
                onClick={onTogglePredictedRiskZones}
              >
                <FaSatelliteDish />
                <span>Predicted Risk Zones</span>
              </button>
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
            <motion.div
              className="alert-banner"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {alertMessage}
            </motion.div>
          ) : null}

          <p className="dashboard-note">
            Heatmap highlights potholes and crashes. “Safe Roads” currently shows lower-risk speed breaker points.
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}