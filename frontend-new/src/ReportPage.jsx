import React from "react";
import { Link } from "react-router-dom";
import { FaArrowLeft, FaBrain, FaChartLine, FaRobot, FaRoute, FaDatabase, FaCogs } from "react-icons/fa";

export default function ReportPage() {
  return (
    <div className="report-scroll-wrapper">
      <div className="report-container">
        
        {/* Header */}
        <header className="report-header">
          <div className="report-title-area">
            <h1 className="report-title">UrbanGuard</h1>
            <p className="report-subtitle">Smart Road Intelligence AI Model & System Performance Report</p>
          </div>
          <Link to="/" className="report-nav-btn">
            <FaArrowLeft /> Back to Dashboard
          </Link>
        </header>

        {/* 1. Executive Summary */}
        <section className="report-section">
          <h2 className="report-section-title"><FaRobot /> Executive Summary</h2>
          <p className="report-text">
            <strong>UrbanGuard</strong> is a next-generation cyber-physical road safety intelligence application designed to aggregate real-time IoT accelerometer telemetry, map localized road threats, compute risk forecasts, and provide optimized hazard-avoiding route calculations.
          </p>
          <p className="report-text">
            By leveraging dual Machine Learning models integrated directly into a glassmorphic React frontend and a FastAPI backend with WebSocket synchronization, the system establishes a full hazard life-cycle management loop. Users can monitor threats, input test vibration metrics, search safe routes, and resolve active hazards dynamically.
          </p>
        </section>

        {/* 2. Machine Learning Core Models */}
        <section className="report-section">
          <h2 className="report-section-title"><FaBrain /> Machine Learning Model Architectures</h2>
          <p className="report-text">
            The application relies on two specialized machine learning classification models. Both models are built using the <strong>Random Forest Classifier</strong> algorithm, which provides robust classification, protects against overfitting via ensemble decision trees, and offers natural feature importance calculations.
          </p>

          <div className="report-grid">
            {/* Model 1 Card */}
            <div className="report-card">
              <h3 className="report-card-title">1. Pothole Vibration Classifier</h3>
              <p className="report-text">
                This model runs inside the interactive <strong>Sandbox Vibration Tester</strong>. It analyzes raw, high-frequency linear accelerometer coordinates from IoT sensors to detect road anomalies.
              </p>
              <ul className="report-list">
                <li><strong>Model Type:</strong> Random Forest Classifier (100 estimators)</li>
                <li><strong>Target Label:</strong> Binary (1: Pothole, 0: Normal Road)</li>
                <li><strong>Telemetry inputs:</strong> <code>ax</code>, <code>ay</code>, <code>az</code>, <code>magnitude</code>, <code>jerk</code>, <code>intensity</code></li>
              </ul>
            </div>

            {/* Model 2 Card */}
            <div className="report-card">
              <h3 className="report-card-title">2. Spatial Road-Risk Classifier</h3>
              <p className="report-text">
                This model evaluates overall hazard forecasting zones. It uses historical geographic densities to classify map segments into low, medium, or high risk.
              </p>
              <ul className="report-list">
                <li><strong>Model Type:</strong> Random Forest Classifier (100 estimators)</li>
                <li><strong>Target Label:</strong> Binary (1: High Risk Zone, 0: Safe Zone)</li>
                <li><strong>Spatial features:</strong> <code>event_count</code>, <code>severity_score</code>, <code>confidence</code>, <code>hour</code>, <code>day</code></li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. Feature Engineering Details */}
        <section className="report-section">
          <h2 className="report-section-title"><FaCogs /> Feature Engineering & Preprocessing</h2>
          <p className="report-text">
            Before training and evaluation, raw values are transformed into high-signal feature vectors:
          </p>

          <h3 style={{ color: "#fff", fontSize: "1.1rem", marginBottom: "10px" }}>Pothole Vibration Model Features</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Feature Name</th>
                <th>Source Formula / Calculation</th>
                <th>Role in Pothole Classification</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>ax, ay, az</code></td>
                <td>Raw accelerometer values (m/s²)</td>
                <td>Measures instantaneous direction-specific forces.</td>
              </tr>
              <tr>
                <td><code>magnitude</code></td>
                <td><code>sqrt(ax² + ay² + az²)</code></td>
                <td>Captures total acceleration force regardless of device orientation.</td>
              </tr>
              <tr>
                <td><code>jerk</code></td>
                <td><code>magnitude.diff()</code></td>
                <td>Measures the rate of change of acceleration. High values indicate sudden jolts.</td>
              </tr>
              <tr>
                <td><code>intensity</code></td>
                <td><code>ax + ay + az</code></td>
                <td>Aggregated scalar sum for linear telemetry weight.</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ color: "#fff", fontSize: "1.1rem", marginBottom: "10px", marginTop: "24px" }}>Spatial Road-Risk Model Features</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Feature Name</th>
                <th>Source Formula / Calculation</th>
                <th>Role in Spatial Risk Scoring</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>event_count</code></td>
                <td>Count of active anomalies within a 500m radius of coordinates.</td>
                <td>Represents hazard density on the specific road segment.</td>
              </tr>
              <tr>
                <td><code>severity_score</code></td>
                <td>Weighted score: <code>Crash * 3 + Pothole * 2 + SpeedBreaker * 1</code></td>
                <td>Scores the qualitative severity of nearby hazard markers.</td>
              </tr>
              <tr>
                <td><code>confidence</code></td>
                <td>Ingested confidence score from client telemetry.</td>
                <td>Weighs reliability of reported incidents.</td>
              </tr>
              <tr>
                <td><code>hour, day</code></td>
                <td>Extracted hours and calendar day from event timestamp.</td>
                <td>Unlocks temporal clustering (e.g. rush-hour crash rates).</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 4. Model Training & Validation */}
        <section className="report-section">
          <h2 className="report-section-title"><FaChartLine /> Model Training & Validation</h2>
          <p className="report-text">
            Both models undergo strict cross-validation and offline evaluations prior to deployment. Training details:
          </p>
          <div className="report-grid">
            <div className="report-card">
              <h4 style={{ color: "#fff", margin: "0 0 10px 0", fontSize: "1.05rem" }}>Vibration Model Details</h4>
              <p className="report-text">
                The Vibration Model has achieved <strong>100% test accuracy</strong> on validation split samples and <strong>86% mean accuracy</strong> on cross-validation testing.
              </p>
              <ul className="report-list">
                <li><strong>Train/Test Split:</strong> 80% train, 20% test.</li>
                <li><strong>Cross-Validation splits:</strong> 5-fold cross-validation.</li>
                <li><strong>Key Feature Importance:</strong> <code>ax</code> (24.8%), <code>magnitude</code> (17.3%), <code>intensity</code> (16.7%), <code>jerk</code> (16.1%).</li>
              </ul>
            </div>
            
            <div className="report-card">
              <h4 style={{ color: "#fff", margin: "0 0 10px 0", fontSize: "1.05rem" }}>Road-Risk Model Details</h4>
              <p className="report-text">
                The Road Risk Model has achieved <strong>80% test accuracy</strong> and <strong>91% mean accuracy</strong> on Decision Tree cross-validation.
              </p>
              <ul className="report-list">
                <li><strong>Train/Test Split:</strong> 80% train, 20% test.</li>
                <li><strong>Cross-Validation splits:</strong> 5-fold cross-validation.</li>
                <li><strong>Key Feature Importance:</strong> <code>confidence</code> (51.3%), <code>severity_score</code> (39.1%), <code>event_count</code> (9.4%).</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 5. Routing Engine */}
        <section className="report-section">
          <h2 className="report-section-title"><FaRoute /> Hazard-Avoiding Smart Routing</h2>
          <p className="report-text">
            When a user requests a route analysis (e.g. from <em>MG Road</em> to <em>Electronic City</em>), the backend executes an advanced hazard-avoidance calculation:
          </p>
          <ul className="report-list">
            <li><strong>Route Query:</strong> Coordinates are geocoded using OpenStreetMap's Nominatim, and up to 3 driving route geometries are fetched from the Open Source Routing Machine (OSRM).</li>
            <li><strong>Waypoint Sampling:</strong> Path coordinates are sampled every 200 meters.</li>
            <li><strong>Safety Scoring:</strong> The system scans a 100m corridor around each path. A weighted hazard penalty is computed: <code>Crash Penalty = 15</code>, <code>Pothole Penalty = 8</code>, <code>Speed Breaker Penalty = 2</code>.</li>
            <li><strong>Indices:</strong> Safety index is calculated: <code>Safety Score = max(10, 100 - total_penalty)</code>. Smoothness index is calculated based on cumulative vertical vibration jerks.</li>
            <li><strong>Log Auditing & Purging:</strong> History items are logged to memory and can be audited and permanently deleted.</li>
          </ul>
        </section>

        {/* 6. System Verification Status */}
        <section className="report-section" style={{ marginBottom: 0 }}>
          <h2 className="report-section-title"><FaDatabase /> System Status</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>Service Layer</th>
                <th>Protocol</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>FastAPI Backend Server</td>
                <td>Uvicorn / HTTP (Port 8002)</td>
                <td><span className="report-badge success">Online / Healthy</span></td>
              </tr>
              <tr>
                <td>Telemetry Live Broadcaster</td>
                <td>WebSocket (<code>/ws/events</code>)</td>
                <td><span className="report-badge success">Active / Broadcasting</span></td>
              </tr>
              <tr>
                <td>Vite Frontend Server</td>
                <td>Vite (Port 5173)</td>
                <td><span className="report-badge success">Online</span></td>
              </tr>
              <tr>
                <td>Pothole Vibration Classifier</td>
                <td>Random Forest (`pothole_vibration_model.pkl`)</td>
                <td><span className="report-badge accent">Trained & Loaded</span></td>
              </tr>
              <tr>
                <td>Spatial Road Risk Forecast</td>
                <td>Random Forest (`road_risk_model.pkl`)</td>
                <td><span className="report-badge accent">Trained & Loaded</span></td>
              </tr>
            </tbody>
          </table>
        </section>

      </div>
    </div>
  );
}
