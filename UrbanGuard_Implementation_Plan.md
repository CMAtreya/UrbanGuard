# UrbanGuard — Detailed ML/AI Implementation Plan

## What you already have (don't touch these)
- App.jsx — WebSocket, event state, stats, route handling ✅
- MapView.jsx — Leaflet map, heatmap, vehicle sim, markers ✅
- Dashboard.jsx — sidebar panel, stat cards, filter, route form ✅
- main.py — FastAPI, WebSocket, /predict-road-risk, /detect-pothole ✅
- train_model.py — RandomForest on lat/lng/confidence/hour/day ✅
- train_vibration_model.py — RandomForest on ax/ay/az/magnitude/jerk/intensity ✅
- fake_data.py — realistic Bengaluru event generator ✅

## What you need to add (only 4 things)
1. Improved training scripts → export metrics JSON
2. /api/ml-stats endpoint in main.py
3. /api/agent/road-summary endpoint in main.py
4. MLStatsCard + AIAgentPanel components in frontend

---

## STEP 1 — Generate training data first

Your train scripts read from road_data.csv which export_data.py creates.
Run these in order:

```bash
cd backend

# Start the backend
uvicorn main:app --reload --port 8002

# In a second terminal — run fake_data for 60 seconds to fill events
python fake_data.py   # Ctrl+C after ~30 seconds

# Export events to CSV
python export_data.py

# Now train both models
python train_model.py
python train_vibration_model.py
```

After this you will have:
- road_risk_model.pkl ← already exists, now improved
- pothole_vibration_model.pkl ← already exists, now improved
- road_risk_metrics.json ← NEW (accuracy, cv scores, feature importances)
- vibration_metrics.json ← NEW (same structure)

---

## STEP 2 — Replace train_model.py

Replace backend/train_model.py with this exact code:

```python
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, classification_report
import joblib
import json
from datetime import datetime

df = pd.read_csv("road_data.csv")

feature_columns = ["lat", "lng", "confidence", "hour", "day"]
required_columns = ["lat", "lng", "confidence", "timestamp", "event_type"]

missing_columns = [c for c in required_columns if c not in df.columns]
if missing_columns:
    raise ValueError("road_data.csv is missing: " + ", ".join(missing_columns))

df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
for col in ["lat", "lng", "confidence"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")

df["hour"] = df["timestamp"].dt.hour
df["day"] = df["timestamp"].dt.day
df = df.dropna(subset=required_columns)

df["risk"] = df["event_type"].apply(lambda v: 1 if v in {"pothole", "crash"} else 0)

X = df[feature_columns]
y = df["risk"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

pred = model.predict(X_test)
accuracy = accuracy_score(y_test, pred)
cv_scores = cross_val_score(model, X, y, cv=5)
report = classification_report(y_test, pred, output_dict=True)
feature_importances = dict(zip(feature_columns, model.feature_importances_.tolist()))

metrics = {
    "model": "road_risk_model",
    "accuracy": round(accuracy, 4),
    "cv_mean": round(cv_scores.mean(), 4),
    "cv_std": round(cv_scores.std(), 4),
    "feature_importances": feature_importances,
    "classification_report": report,
    "trained_at": datetime.utcnow().isoformat(),
    "training_samples": len(X_train),
    "test_samples": len(X_test),
}

joblib.dump(model, "road_risk_model.pkl")
with open("road_risk_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

print(f"Road-risk model — Accuracy: {accuracy:.4f}, CV: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
```

---

## STEP 3 — Replace train_vibration_model.py

Replace backend/train_vibration_model.py with this exact code:

```python
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, classification_report
import joblib
import json
from datetime import datetime

df = pd.read_csv("road_data.csv")

feature_columns = ["ax", "ay", "az", "magnitude", "jerk", "intensity"]
required_columns = ["ax", "ay", "az", "magnitude", "timestamp", "event_type"]

missing_columns = [c for c in required_columns if c not in df.columns]
if missing_columns:
    raise ValueError("road_data.csv is missing: " + ", ".join(missing_columns))

df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
for col in ["ax", "ay", "az", "magnitude"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")

df = df.sort_values("timestamp").reset_index(drop=True)
df["jerk"] = df["magnitude"].diff().fillna(0)
df["intensity"] = df["ax"] + df["ay"] + df["az"]
df = df.dropna(subset=required_columns + ["jerk", "intensity"])
df["pothole"] = df["event_type"].apply(lambda v: 1 if v == "pothole" else 0)

X = df[feature_columns]
y = df["pothole"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

pred = model.predict(X_test)
accuracy = accuracy_score(y_test, pred)
cv_scores = cross_val_score(model, X, y, cv=5)
report = classification_report(y_test, pred, output_dict=True)
feature_importances = dict(zip(feature_columns, model.feature_importances_.tolist()))

metrics = {
    "model": "pothole_vibration_model",
    "accuracy": round(accuracy, 4),
    "cv_mean": round(cv_scores.mean(), 4),
    "cv_std": round(cv_scores.std(), 4),
    "feature_importances": feature_importances,
    "classification_report": report,
    "trained_at": datetime.utcnow().isoformat(),
    "training_samples": len(X_train),
    "test_samples": len(X_test),
}

joblib.dump(model, "pothole_vibration_model.pkl")
with open("vibration_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

print(f"Vibration model — Accuracy: {accuracy:.4f}, CV: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
```

---

## STEP 4 — Add 2 new endpoints to main.py

At the top of main.py, add these imports (alongside existing ones):
```python
import json
import os
import httpx
```

At the very bottom of main.py, paste these two endpoints:

### Endpoint 1 — ML Stats
```python
@app.get("/api/ml-stats")
def get_ml_stats():
    stats = {}
    road_path = Path(__file__).with_name("road_risk_metrics.json")
    vibration_path = Path(__file__).with_name("vibration_metrics.json")

    stats["road_risk"] = json.load(open(road_path)) if road_path.exists() else None
    stats["vibration"] = json.load(open(vibration_path)) if vibration_path.exists() else None
    return stats
```

### Endpoint 2 — AI Agent
```python
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

@app.get("/api/agent/road-summary")
async def road_summary_agent(lat: float, lng: float, radius_m: float = 500):
    from math import radians, sin, cos, sqrt, atan2

    def haversine(lat1, lng1, lat2, lng2):
        R = 6371000
        phi1, phi2 = radians(lat1), radians(lat2)
        dphi = radians(lat2 - lat1)
        dlam = radians(lng2 - lng1)
        a = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlam/2)**2
        return R * 2 * atan2(sqrt(a), sqrt(1 - a))

    nearby = [e for e in events if haversine(lat, lng, e["lat"], e["lng"]) <= radius_m]

    if not nearby:
        return {
            "summary": "No road events detected within 500m. Road conditions appear clear.",
            "risk_level": "LOW",
            "event_count": 0,
        }

    event_counts = {}
    for e in nearby:
        t = e["event_type"]
        event_counts[t] = event_counts.get(t, 0) + 1

    avg_mag = round(sum(e["magnitude"] for e in nearby) / len(nearby), 2)
    count = len(nearby)
    risk = "HIGH" if count > 5 or avg_mag > 8 else "MEDIUM" if count > 2 else "LOW"

    if not GEMINI_API_KEY:
        dominant = max(event_counts, key=event_counts.get)
        return {
            "summary": f"Detected {count} road events near this location, mainly {dominant}s. Average vibration magnitude is {avg_mag} m/s². {'Reduce speed to 20 km/h — high risk zone.' if risk == 'HIGH' else 'Proceed carefully at 30 km/h.' if risk == 'MEDIUM' else 'Road conditions manageable. Normal speed is fine.'}",
            "risk_level": risk,
            "event_count": count,
            "nearby_events": event_counts,
        }

    prompt = f"""You are UrbanGuard's road intelligence agent for Indian cities.

Nearby road events within 500m of ({lat:.4f}, {lng:.4f}):
- Event breakdown: {event_counts}
- Total events: {count}
- Average vibration magnitude: {avg_mag} m/s²

Write a 2-3 sentence road condition summary for a driver approaching this area.
Be specific about hazard types and urgency. End with a recommended speed.
Do not use bullet points. Write naturally like a navigation assistant."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 200},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=10)

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI agent unavailable")

    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    return {
        "summary": text.strip(),
        "risk_level": risk,
        "event_count": count,
        "nearby_events": event_counts,
    }
```

Also update CORS in main.py to add ngrok support (for phone testing):
```python
allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:5176",
    "http://127.0.0.1:5176",
    "*",   # ← add this for ngrok/phone testing
],
```

Install httpx:
```bash
pip install httpx
```

---

## STEP 5 — Add MLStatsCard to Dashboard.jsx

This is a new stat card inside your existing Dashboard panel.
Find the StatCard section in Dashboard.jsx and add this component after it:

```jsx
// Add this component in Dashboard.jsx (after StatCard definition, before export default)

function MLStatsCard({ mlStats }) {
  if (!mlStats) return null;

  const road = mlStats.road_risk;
  const vibration = mlStats.vibration;

  return (
    <div className="stat-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "10px" }}>
      <p className="stat-label" style={{ marginBottom: 4 }}>🤖 ML Models</p>

      {road && (
        <div style={{ width: "100%" }}>
          <p className="stat-label" style={{ fontSize: 11, opacity: 0.7 }}>Road Risk Model</p>
          <p className="stat-value" style={{ fontSize: 20 }}>
            {(road.accuracy * 100).toFixed(1)}%
            <span className="stat-label" style={{ fontSize: 11, marginLeft: 6 }}>accuracy</span>
          </p>
          <p className="stat-label" style={{ fontSize: 11 }}>
            CV: {(road.cv_mean * 100).toFixed(1)}% ± {(road.cv_std * 100).toFixed(1)}%
          </p>
          <p className="stat-label" style={{ fontSize: 11 }}>
            Trained on {road.training_samples} samples
          </p>

          {/* Feature importance bars */}
          <div style={{ marginTop: 8 }}>
            {Object.entries(road.feature_importances)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([feat, score]) => (
                <div key={feat} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.7 }}>
                    <span>{feat}</span>
                    <span>{(score * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                    <div style={{
                      height: "100%",
                      width: `${score * 100}%`,
                      background: "var(--accent)",
                      borderRadius: 2,
                      transition: "width 0.6s ease"
                    }} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {vibration && (
        <div style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
          <p className="stat-label" style={{ fontSize: 11, opacity: 0.7 }}>Vibration Model</p>
          <p className="stat-value" style={{ fontSize: 20 }}>
            {(vibration.accuracy * 100).toFixed(1)}%
            <span className="stat-label" style={{ fontSize: 11, marginLeft: 6 }}>accuracy</span>
          </p>
        </div>
      )}
    </div>
  );
}
```

Then in the Dashboard component function, add the fetch:
```jsx
// Add inside Dashboard component (after existing useState lines)
const [mlStats, setMlStats] = useState(null);

useEffect(() => {
  fetch(`${API_BASE}/api/ml-stats`)
    .then(r => r.json())
    .then(setMlStats)
    .catch(() => {});
}, []);
```

And render it inside the panel (after your existing StatCard group):
```jsx
<MLStatsCard mlStats={mlStats} />
```

Note: Dashboard.jsx doesn't import API_BASE — add this at the top:
```jsx
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8002";
```

---

## STEP 6 — Add AI Agent panel to MapView.jsx

When user clicks any map marker, show the AI road summary in the Leaflet Popup.

In MapView.jsx, find where Popup is rendered inside your CircleMarker or Marker.
Replace the Popup contents with this pattern:

```jsx
// Add this hook inside MapView component (near top, with other useState)
const [agentSummary, setAgentSummary] = useState({});  // keyed by "lat,lng"

// Add this function inside MapView component
const fetchAgentSummary = async (lat, lng) => {
  const key = `${lat},${lng}`;
  if (agentSummary[key]) return;  // already fetched

  try {
    const res = await fetch(`${API_BASE}/api/agent/road-summary?lat=${lat}&lng=${lng}`);
    const data = await res.json();
    setAgentSummary(prev => ({ ...prev, [key]: data }));
  } catch (e) {
    setAgentSummary(prev => ({ ...prev, [key]: { summary: "Unable to fetch AI summary.", risk_level: "UNKNOWN" } }));
  }
};

// In your marker's eventHandlers, call fetchAgentSummary on click:
// eventHandlers={{ click: () => fetchAgentSummary(event.lat, event.lng) }}

// In the Popup, show the summary:
const key = `${event.lat},${event.lng}`;
const summary = agentSummary[key];
```

Inside the Popup JSX:
```jsx
<Popup>
  <div style={{ minWidth: 200, fontFamily: "sans-serif" }}>
    <strong>{event.event_type}</strong><br />
    <span style={{ fontSize: 12, opacity: 0.8 }}>
      Confidence: {(event.confidence * 100).toFixed(0)}%
    </span>
    <hr style={{ margin: "8px 0", opacity: 0.2 }} />
    {summary ? (
      <div>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: summary.risk_level === "HIGH" ? "#ef4444" : summary.risk_level === "MEDIUM" ? "#f59e0b" : "#22c55e"
        }}>
          {summary.risk_level} RISK · {summary.event_count} events nearby
        </span>
        <p style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{summary.summary}</p>
      </div>
    ) : (
      <p style={{ fontSize: 12, opacity: 0.6 }}>Loading AI summary...</p>
    )}
  </div>
</Popup>
```

---

## STEP 7 — Set Gemini API key and run

```bash
# Set your key (same one from Saathi project)
export GEMINI_API_KEY="your-gemini-api-key"

# Start backend
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8002

# Start frontend (separate terminal)
cd frontend-new
npm run dev
```

Test the new endpoints directly in browser:
- http://localhost:8002/api/ml-stats
- http://localhost:8002/api/agent/road-summary?lat=12.9352&lng=77.6012

---

## FINAL CHECKLIST — in order

[ ] 1. Run fake_data.py for 30s → Ctrl+C
[ ] 2. Run export_data.py → road_data.csv created
[ ] 3. Replace train_model.py → run it → road_risk_metrics.json created
[ ] 4. Replace train_vibration_model.py → run it → vibration_metrics.json created
[ ] 5. Add imports + 2 endpoints to main.py
[ ] 6. pip install httpx
[ ] 7. Add MLStatsCard component + useEffect fetch in Dashboard.jsx
[ ] 8. Add agentSummary state + fetchAgentSummary + updated Popup in MapView.jsx
[ ] 9. Set GEMINI_API_KEY environment variable
[ ] 10. Restart backend → verify /api/ml-stats returns data
[ ] 11. Click any map marker → verify AI summary loads in popup

---

## What this gives you to demonstrate

"Our system uses two ML models: a road risk classifier trained on geospatial and temporal features, and a vibration-based pothole detector trained on accelerometer data. Both use Random Forest with 5-fold cross-validation. Accuracy and feature importances are served live to the dashboard. We also integrated an AI agent using Gemini 2.0 Flash — when you click any location on the map, the agent reads all nearby events and generates a natural language road condition summary in real time."

That's a complete, honest, demonstrable ML + AI story with zero new pages and minimal changes to your existing code.
