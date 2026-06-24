import pandas as pd
import requests
import os


FEATURE_COLUMNS = ["ax", "ay", "az", "magnitude"]
API_BASE = os.environ.get("URBANGUARD_API_BASE", "http://127.0.0.1:8002").rstrip("/")


def to_float_or_default(value, default):
	if value is None or value == "":
		return float(default)

	try:
		return float(value)
	except (TypeError, ValueError):
		return float(default)


def infer_sensor_values(event):
	event_type = str(event.get("event_type", "")).lower()

	if event_type == "pothole":
		ax, ay, az = 2.1, 1.9, 2.4
	elif event_type == "crash":
		ax, ay, az = 3.9, 3.6, 4.1
	elif event_type == "speed_breaker":
		ax, ay, az = 1.1, 1.0, 1.3
	else:
		ax, ay, az = 1.4, 1.3, 1.5

	magnitude = (ax * ax + ay * ay + az * az) ** 0.5

	return {
		"ax": round(to_float_or_default(event.get("ax"), ax), 2),
		"ay": round(to_float_or_default(event.get("ay"), ay), 2),
		"az": round(to_float_or_default(event.get("az"), az), 2),
		"magnitude": round(to_float_or_default(event.get("magnitude"), magnitude), 2),
	}

response = requests.get(f"{API_BASE}/api/events", timeout=10)

if response.status_code == 404:
	response = requests.get(f"{API_BASE}/events", timeout=10)

response.raise_for_status()
payload = response.json()
events = payload.get("events", payload) if isinstance(payload, dict) else payload

normalized_events = []
for event in events:
	enriched_event = dict(event)
	enriched_event.update(infer_sensor_values(event))
	normalized_events.append(enriched_event)

df = pd.DataFrame(normalized_events)

column_order = [
	"device_id",
	"event_type",
	"lat",
	"lng",
	"confidence",
	*FEATURE_COLUMNS,
	"timestamp",
]

for column in column_order:
	if column not in df.columns:
		df[column] = pd.NA

df = df[column_order]
df.to_csv("road_data.csv", index=False)

print("Dataset saved to road_data.csv")
