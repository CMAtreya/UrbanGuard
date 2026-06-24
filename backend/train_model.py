import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib

# Load data
df = pd.read_csv("road_data.csv")

feature_columns = ["lat", "lng", "confidence", "hour", "day"]
required_columns = ["lat", "lng", "confidence", "timestamp", "event_type"]

missing_columns = [column for column in required_columns if column not in df.columns]
if missing_columns:
	raise ValueError(
		"road_data.csv is missing required columns for road-risk training: "
		+ ", ".join(missing_columns)
		+ ". Regenerate the dataset after exporting sensor-based events."
	)

# Convert and clean the training set
df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

for column in ["lat", "lng", "confidence"]:
	df[column] = pd.to_numeric(df[column], errors="coerce")

df["hour"] = df["timestamp"].dt.hour
df["day"] = df["timestamp"].dt.day

df = df.dropna(subset=required_columns)

# Binary risk target
df["risk"] = df["event_type"].apply(lambda value: 1 if value in {"pothole", "crash"} else 0)

# Features
X = df[feature_columns]
y = df["risk"]

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Model
model = RandomForestClassifier(random_state=42)
model.fit(X_train, y_train)

# Save model
joblib.dump(model, "road_risk_model.pkl")

print("Road-risk model trained 🚀")
