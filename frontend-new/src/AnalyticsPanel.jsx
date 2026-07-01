import { useEffect, useState } from "react";
import { FaChartBar, FaExclamationTriangle, FaMapMarkerAlt, FaCalendarDay, FaRoad } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8002";

function MiniBarChart({ data, maxHeight = 32 }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: `${maxHeight}px` }}>
      {data.map((val, i) => {
        const h = Math.max(2, (val / max) * maxHeight);
        const isHigh = val / max > 0.7;
        return (
          <div
            key={i}
            title={`${i}:00 — ${val} events`}
            style={{
              flex: 1,
              height: `${h}px`,
              borderRadius: "2px 2px 0 0",
              background: isHigh
                ? "rgba(239, 68, 68, 0.7)"
                : val / max > 0.4
                ? "rgba(245, 158, 11, 0.6)"
                : "rgba(96, 165, 250, 0.5)",
              transition: "height 0.3s ease",
              minWidth: "3px",
            }}
          />
        );
      })}
    </div>
  );
}

export default function AnalyticsPanel() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/analytics/summary`);
        if (res.ok && active) setData(await res.json());
      } catch { /* ignore */ }
    };
    load();
    // Refresh every 60s
    const interval = setInterval(load, 60_000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (!data) return null;

  return (
    <div style={{
      marginTop: "16px",
      padding: "14px",
      background: "rgba(255,255,255,0.02)",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", marginBottom: expanded ? "12px" : 0,
        }}
      >
        <p className="section-label" style={{ margin: 0, fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
          <FaChartBar style={{ color: "#a78bfa" }} /> Analytics Dashboard
        </p>
        <span style={{ fontSize: "10px", opacity: 0.5 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <>
          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px" }}>
            {[
              { icon: FaExclamationTriangle, label: "Total Potholes", value: data.total_potholes, color: "#ef4444" },
              { icon: FaCalendarDay, label: "Today", value: data.today_detections, color: "#60a5fa" },
              { icon: FaRoad, label: "Avg Road Score", value: data.avg_road_score, color: data.avg_road_score >= 70 ? "#22c55e" : data.avg_road_score >= 40 ? "#f59e0b" : "#ef4444" },
              { icon: FaChartBar, label: "Total Events", value: data.total_events, color: "#a78bfa" },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} style={{
                padding: "8px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.04)",
                textAlign: "center",
              }}>
                <Icon style={{ fontSize: "12px", color, marginBottom: "4px" }} />
                <p style={{ margin: 0, fontSize: "18px", fontWeight: 800, color }}>{value}</p>
                <p style={{ margin: 0, fontSize: "9px", opacity: 0.55 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Most dangerous area */}
          <div style={{
            padding: "8px 10px",
            borderRadius: "8px",
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.15)",
            marginBottom: "10px",
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <FaMapMarkerAlt style={{ color: "#ef4444", fontSize: "14px" }} />
            <div>
              <p style={{ margin: 0, fontSize: "10px", opacity: 0.6 }}>Most Dangerous Area</p>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#f87171" }}>
                {data.most_dangerous_area}
              </p>
              <p style={{ margin: 0, fontSize: "10px", opacity: 0.5 }}>
                {data.most_dangerous_count} events recorded
              </p>
            </div>
          </div>

          {/* Hourly trend */}
          {data.hourly_trend && (
            <div>
              <p style={{ margin: "0 0 6px 0", fontSize: "10px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                24-Hour Trend
              </p>
              <MiniBarChart data={data.hourly_trend} maxHeight={36} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                <span style={{ fontSize: "8px", opacity: 0.35 }}>0:00</span>
                <span style={{ fontSize: "8px", opacity: 0.35 }}>6:00</span>
                <span style={{ fontSize: "8px", opacity: 0.35 }}>12:00</span>
                <span style={{ fontSize: "8px", opacity: 0.35 }}>18:00</span>
                <span style={{ fontSize: "8px", opacity: 0.35 }}>23:00</span>
              </div>
            </div>
          )}

          {/* Event type distribution */}
          {data.event_type_distribution && (
            <div style={{ marginTop: "10px" }}>
              <p style={{ margin: "0 0 6px 0", fontSize: "10px", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Event Distribution
              </p>
              {Object.entries(data.event_type_distribution).map(([type, count]) => {
                const pct = data.total_events > 0 ? (count / data.total_events) * 100 : 0;
                const color = type === "pothole" ? "#ef4444" : type === "crash" ? "#f87171" : "#f59e0b";
                return (
                  <div key={type} style={{ marginBottom: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "2px" }}>
                      <span style={{ textTransform: "capitalize", opacity: 0.7 }}>
                        {type === "speed_breaker" ? "Speed Breaker" : type}
                      </span>
                      <span style={{ fontWeight: 700, color }}>{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.05)" }}>
                      <div style={{
                        height: "100%",
                        width: `${pct}%`,
                        borderRadius: "2px",
                        background: color,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
