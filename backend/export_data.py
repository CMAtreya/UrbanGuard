import pandas as pd
import requests

response = requests.get("http://127.0.0.1:8000/events", timeout=10)
response.raise_for_status()
events = response.json()
df = pd.DataFrame(events)
df.to_csv("road_data.csv", index=False)

print("Dataset saved to road_data.csv")
