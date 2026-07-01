import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaBrain, FaChevronDown, FaChevronUp, FaDatabase } from "react-icons/fa";

export default function MLStatsCard({ mlStats }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!mlStats) {
    return (
      <div className="stat-card skeleton" style={{ minHeight: "100px", opacity: 0.5 }}>
        <p className="stat-label">🤖 ML Models</p>
        <div style={{ marginTop: 8, height: "14px", background: "rgba(255,255,255,0.08)", borderRadius: "4px" }} />
        <div style={{ marginTop: 8, height: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", width: "70%" }} />
      </div>
    );
  }

  const road = mlStats.road_risk;
  const vibration = mlStats.vibration;

  return (
    <div 
      className="stat-card" 
      style={{ 
        flexDirection: "column", 
        alignItems: "flex-start", 
        gap: "12px",
        padding: "16px",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        borderRadius: "16px",
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.2)",
        backdropFilter: "blur(10px)",
        width: "100%",
        boxSizing: "border-box"
      }}
    >
      <div 
        style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          width: "100%",
          cursor: "pointer"
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FaBrain style={{ color: "var(--accent, #f59e0b)", fontSize: "16px" }} />
          <p className="stat-label" style={{ margin: 0, fontWeight: 600 }}>🤖 ML Performance Models</p>
        </div>
        <div>
          {isExpanded ? <FaChevronUp style={{ fontSize: "12px", opacity: 0.7 }} /> : <FaChevronDown style={{ fontSize: "12px", opacity: 0.7 }} />}
        </div>
      </div>

      {road && (
        <div style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <p className="stat-label" style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>Road Risk Classifier</p>
            <p className="stat-value" style={{ fontSize: 18, color: "#22c55e", margin: 0 }}>
              {(road.accuracy * 100).toFixed(1)}%
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>acc</span>
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.6, marginTop: 4 }}>
            <span>CV Mean: {(road.cv_mean * 100).toFixed(1)}% ± {(road.cv_std * 100).toFixed(1)}%</span>
            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
              <FaDatabase style={{ fontSize: 8 }} /> {road.training_samples} samples
            </span>
          </div>

          {/* Feature importance bars (always shown in compact mode) */}
          <div style={{ marginTop: 8 }}>
            {Object.entries(road.feature_importances)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([feat, score]) => (
                <div key={feat} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, opacity: 0.7, marginBottom: 2 }}>
                    <span style={{ textTransform: "capitalize" }}>{feat.replace("_", " ")}</span>
                    <span>{(score * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${score * 100}%`,
                      background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                      borderRadius: 2,
                      transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
                    }} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {isExpanded && vibration && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ 
              width: "100%", 
              borderTop: "1px solid rgba(255,255,255,0.08)", 
              paddingTop: "10px",
              marginTop: "4px",
              overflow: "hidden"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <p className="stat-label" style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>Vibration Pothole Detector</p>
              <p className="stat-value" style={{ fontSize: 18, color: "#3b82f6", margin: 0 }}>
                {(vibration.accuracy * 100).toFixed(1)}%
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>acc</span>
              </p>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.6, marginTop: 4, marginBottom: 8 }}>
              <span>CV Mean: {(vibration.cv_mean * 100).toFixed(1)}% ± {(vibration.cv_std * 100).toFixed(1)}%</span>
              <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <FaDatabase style={{ fontSize: 8 }} /> {vibration.training_samples} samples
              </span>
            </div>

            {/* Vibration features */}
            {vibration.feature_importances && (
              <div>
                {Object.entries(vibration.feature_importances)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([feat, score]) => (
                    <div key={feat} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, opacity: 0.7, marginBottom: 2 }}>
                        <span style={{ textTransform: "capitalize" }}>{feat}</span>
                        <span>{(score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${score * 100}%`,
                          background: "linear-gradient(90deg, #10b981, #34d399)",
                          borderRadius: 2,
                          transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
                        }} />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
