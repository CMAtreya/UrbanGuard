from datetime import UTC, datetime

import pandas as pd
import joblib

model = joblib.load("pothole_model.pkl")

now = datetime.now(UTC)
hour = now.hour
day = now.day

sample = pd.DataFrame(
    [[12.29, 76.63, 0.9, hour, day]],
    columns=["lat", "lng", "confidence", "hour", "day"],
)

prediction = model.predict(sample)
print("Prediction:", prediction)

if prediction[0] == 0:
    print("Meaning: Safe")
else:
    print("Meaning: Risky road")
