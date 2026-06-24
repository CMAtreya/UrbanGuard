import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import joblib


df = pd.read_csv("road_data.csv")

feature_columns = ["ax", "ay", "az", "magnitude", "jerk", "intensity"]
required_columns = ["ax", "ay", "az", "magnitude", "timestamp", "event_type"]

missing_columns = [column for column in required_columns if column not in df.columns]
if missing_columns:
	raise ValueError(
		"road_data.csv is missing required columns for vibration training: "
		+ ", ".join(missing_columns)
		+ ". Regenerate the dataset using the current export flow first."
	)

df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
for column in feature_columns:
	if column in df.columns:
		df[column] = pd.to_numeric(df[column], errors="coerce")

df = df.sort_values("timestamp").reset_index(drop=True)
df["jerk"] = df["magnitude"].diff().fillna(0)
df["intensity"] = df["ax"] + df["ay"] + df["az"]

df = df.dropna(subset=required_columns + ["jerk", "intensity"])

df["pothole"] = df["event_type"].apply(lambda value: 1 if value == "pothole" else 0)

X = df[feature_columns]
y = df["pothole"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(random_state=42)
model.fit(X_train, y_train)

pred = model.predict(X_test)
print("Accuracy:", accuracy_score(y_test, pred))

joblib.dump(model, "pothole_vibration_model.pkl")

print("Vibration pothole model trained 🚀")