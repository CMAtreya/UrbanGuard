import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib

# Load data
df = pd.read_csv("road_data.csv")

# Convert and extract time-based features
df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
df = df.dropna(subset=["timestamp", "lat", "lng", "confidence", "event_type"])
df["hour"] = df["timestamp"].dt.hour
df["day"] = df["timestamp"].dt.day

# Binary risk target
df["risk"] = df["event_type"].apply(lambda value: 1 if value == "pothole" else 0)

# Features
X = df[["lat", "lng", "confidence", "hour", "day"]]
y = df["risk"]

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Model
model = RandomForestClassifier(random_state=42)
model.fit(X_train, y_train)

# Save model
joblib.dump(model, "pothole_model.pkl")

print("Model trained 🚀")
