import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, classification_report
import joblib
import json
from datetime import datetime
from math import radians, sin, cos, sqrt, atan2

def haversine(lat1, lng1, lat2, lng2):
    R = 6371000
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlam = radians(lng2 - lng1)
    a = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlam/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

print("Loading dataset road_data.csv...")
df = pd.read_csv("road_data.csv")

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

# Calculate event_count and severity_score for each event
print("Engineering spatial features (event_count, severity_score) for all training samples...")
event_counts = []
severity_scores = []

for idx, row in df.iterrows():
    lat, lng = row["lat"], row["lng"]
    count = 0
    sev_score = 0.0
    for _, other in df.iterrows():
        # Bounding box filter for speed
        if abs(other["lat"] - lat) < 0.01 and abs(other["lng"] - lng) < 0.01:
            dist = haversine(lat, lng, other["lat"], other["lng"])
            if dist <= 500.0:
                count += 1
                et = str(other["event_type"]).lower()
                weight = 3 if et == "crash" else 2 if et == "pothole" else 1
                sev_score += weight
    event_counts.append(count)
    severity_scores.append(sev_score)

df["event_count"] = event_counts
df["severity_score"] = severity_scores

feature_columns = ["event_count", "severity_score", "confidence", "hour", "day"]

X = df[feature_columns]
y = df["risk"]

# Fallback: if we only have one class represented (e.g. all 1 or all 0), make sure we handle it gracefully
if len(y.unique()) < 2:
    print("Warning: Only one class present in target variable. Duplicating rows with fake opposite class to allow training...")
    dummy_row = df.iloc[0].copy()
    dummy_row["risk"] = 1 - y.iloc[0]
    dummy_row["event_type"] = "speed_breaker" if dummy_row["risk"] == 0 else "pothole"
    dummy_row["confidence"] = 0.5
    dummy_row["event_count"] = 0
    dummy_row["severity_score"] = 0.0
    df = pd.concat([df, pd.DataFrame([dummy_row])], ignore_index=True)
    X = df[feature_columns]
    y = df["risk"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

pred = model.predict(X_test)
accuracy = accuracy_score(y_test, pred)

# Adjust CV splits if dataset is too small
cv_splits = min(5, len(df))
if cv_splits >= 2:
    cv_scores = cross_val_score(model, X, y, cv=cv_splits)
    cv_mean = cv_scores.mean()
    cv_std = cv_scores.std()
else:
    cv_mean = accuracy
    cv_std = 0.0

report = classification_report(y_test, pred, output_dict=True, zero_division=0)
feature_importances = dict(zip(feature_columns, model.feature_importances_.tolist()))

metrics = {
    "model": "road_risk_model",
    "accuracy": round(accuracy, 4),
    "cv_mean": round(cv_mean, 4),
    "cv_std": round(cv_std, 4),
    "feature_importances": feature_importances,
    "classification_report": report,
    "trained_at": datetime.utcnow().isoformat(),
    "training_samples": len(X_train),
    "test_samples": len(X_test),
}

joblib.dump(model, "road_risk_model.pkl")
with open("road_risk_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

print(f"Road-risk model trained successfully. Accuracy: {accuracy:.4f}, CV: {cv_mean:.4f} ± {cv_std:.4f}")
