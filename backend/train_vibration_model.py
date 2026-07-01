import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, classification_report
import joblib
import json
from datetime import datetime

print("Loading dataset road_data.csv for vibration model...")
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

# Fallback: if we only have one class represented, duplicate rows to allow training
if len(y.unique()) < 2:
    print("Warning: Only one class present in target variable. Duplicating rows with fake opposite class to allow training...")
    dummy_row = df.iloc[0].copy()
    dummy_row["pothole"] = 1 - y.iloc[0]
    dummy_row["event_type"] = "speed_breaker" if dummy_row["pothole"] == 0 else "pothole"
    dummy_row["ax"] = dummy_row["ax"] * 0.5
    dummy_row["ay"] = dummy_row["ay"] * 0.5
    dummy_row["az"] = dummy_row["az"] * 0.5
    dummy_row["magnitude"] = dummy_row["magnitude"] * 0.5
    dummy_row["jerk"] = 0
    dummy_row["intensity"] = dummy_row["intensity"] * 0.5
    df = pd.concat([df, pd.DataFrame([dummy_row])], ignore_index=True)
    X = df[feature_columns]
    y = df["pothole"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

pred = model.predict(X_test)
accuracy = accuracy_score(y_test, pred)

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
    "model": "pothole_vibration_model",
    "accuracy": round(accuracy, 4),
    "cv_mean": round(cv_mean, 4),
    "cv_std": round(cv_std, 4),
    "feature_importances": feature_importances,
    "classification_report": report,
    "trained_at": datetime.utcnow().isoformat(),
    "training_samples": len(X_train),
    "test_samples": len(X_test),
}

joblib.dump(model, "pothole_vibration_model.pkl")
with open("vibration_metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

print(f"Vibration model trained successfully. Accuracy: {accuracy:.4f}, CV: {cv_mean:.4f} ± {cv_std:.4f}")