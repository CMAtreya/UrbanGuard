import { useState } from "react";
import { FaRoute, FaShieldAlt, FaBolt, FaRoad, FaStar, FaHistory, FaSpinner } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8002";

const ROUTE_COLORS = {
  safest: "#22c55e",
  fastest: "#6366f1",
  smoothest: "#f59e0b",
  alternative: "#64748b",
};

const ROUTE_ICONS = {
  safest: FaShieldAlt,
  fastest: FaBolt,
  smoothest: FaRoad,
  alternative: FaRoute,
};

function ScoreGauge({ score, label, color }) {
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="32" cy="32" r="28" fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text x="32" y="36" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="800">{score}</text>
      </svg>
      <span style={{ fontSize: "9px", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
    </div>
  );
}

function RouteCard({ route, index, isSelected, onSelect }) {
  const Icon = ROUTE_ICONS[route.type] ?? FaRoute;
  const color = ROUTE_COLORS[route.type] ?? "#64748b";
  const isRecommended = route.recommended;

  return (
    <div
      onClick={() => onSelect(index)}
      style={{
        position: "relative",
        padding: "12px",
        borderRadius: "12px",
        background: isSelected ? `${color}18` : "rgba(255,255,255,0.03)",
        border: isSelected ? `2px solid ${color}` : "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer",
        transition: "all 0.25s ease",
        marginBottom: "8px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "28px", height: "28px",
            borderRadius: "8px",
            background: `${color}22`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon style={{ fontSize: "12px", color }} />
          </div>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 700, color, textTransform: "capitalize" }}>
              {route.type} Route
            </span>
            {isRecommended && (
              <span style={{
                marginLeft: "6px",
                fontSize: "9px",
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: "4px",
                background: "rgba(250, 204, 21, 0.15)",
                color: "#facc15",
              }}>
                <FaStar style={{ fontSize: "8px", marginRight: "2px" }} />RECOMMENDED
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scores */}
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "10px" }}>
        <ScoreGauge score={route.safety_score} label="Safety" color="#22c55e" />
        <ScoreGauge score={route.smoothness_score} label="Smooth" color="#f59e0b" />
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", opacity: 0.7 }}>
        <span>📏 {route.distance_km} km</span>
        <span>⏱ {route.duration_min} min</span>
        <span>⚠️ {route.anomaly_count} anomalies</span>
      </div>
      {route.potholes_avoided > 0 && (
        <div style={{ marginTop: "4px", fontSize: "10px", color: "#22c55e", fontWeight: 600 }}>
          ✅ {route.potholes_avoided} potholes avoided
        </div>
      )}
    </div>
  );
}

export default function RouteAnalyzer({ onRoutesAnalyzed, onRouteSelected, analyzedRoutes }) {
  const [source, setSource] = useState("MG Road, Bengaluru");
  const [destination, setDestination] = useState("Electronic City, Bengaluru");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  const handleAnalyze = async () => {
    if (!source.trim() || !destination.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/routes/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: source.trim(), destination: destination.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Error ${res.status}`);
      }

      const data = await res.json();
      onRoutesAnalyzed(data);
      setSelectedIndex(0);
      if (data.routes?.length > 0) {
        onRouteSelected(0);
      }
    } catch (err) {
      setError(err.message || "Failed to analyze routes");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/route-logs`);
      const data = await res.json();
      setHistory(data.logs || []);
    } catch { /* ignore */ }
  };

  const handleSelect = (idx) => {
    setSelectedIndex(idx);
    onRouteSelected(idx);
  };

  const routes = analyzedRoutes?.routes || [];

  return (
    <div style={{
      marginTop: "16px",
      padding: "14px",
      background: "rgba(255,255,255,0.02)",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <p className="section-label" style={{ margin: 0, fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
          <FaShieldAlt style={{ color: "#22c55e" }} /> AI Safe Route Navigator
        </p>
        <button
          type="button"
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
          style={{
            background: "none", border: "none", color: "#60a5fa",
            fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
          }}
        >
          <FaHistory style={{ fontSize: "10px" }} /> {showHistory ? "Routes" : "History"}
        </button>
      </div>

      {!showHistory ? (
        <>
          {/* Input form */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
            <input
              className="route-input"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Source: e.g. MG Road, Bengaluru"
              style={{ fontSize: "12px", padding: "8px 10px" }}
            />
            <input
              className="route-input"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Destination: e.g. Electronic City"
              style={{ fontSize: "12px", padding: "8px 10px" }}
            />
            <button
              className="route-button"
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? <FaSpinner className="spin-icon" style={{ animation: "spin 1s linear infinite" }} /> : <FaShieldAlt />}
              {loading ? "Analyzing Routes…" : "Analyze Safe Routes"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "8px 12px",
              borderRadius: "8px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              fontSize: "11px",
              color: "#f87171",
              marginBottom: "8px",
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Results */}
          {routes.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", opacity: 0.5, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {routes.length} routes found — {analyzedRoutes?.source} → {analyzedRoutes?.destination}
              </div>
              {routes.map((route, i) => (
                <RouteCard
                  key={`${route.type}-${i}`}
                  route={route}
                  index={i}
                  isSelected={i === selectedIndex}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && routes.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[1, 2, 3].map((n) => (
                <div key={n} style={{
                  height: "90px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  animation: "pulse 1.5s ease infinite",
                }} />
              ))}
            </div>
          )}
        </>
      ) : (
        /* History panel */
        <div>
          {history.length === 0 ? (
            <p style={{ fontSize: "11px", opacity: 0.45 }}>No route history yet.</p>
          ) : (
            history.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  marginBottom: "6px",
                  fontSize: "11px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{log.source} → {log.destination}</span>
                  <span style={{ opacity: 0.5 }}>{new Date(log.timestamp).toLocaleDateString()}</span>
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "4px", opacity: 0.65 }}>
                  {log.safest_score != null && <span>Safety: {log.safest_score}</span>}
                  {log.safest_distance_km != null && <span>{log.safest_distance_km} km</span>}
                  {log.potholes_avoided > 0 && <span style={{ color: "#22c55e" }}>+{log.potholes_avoided} avoided</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
