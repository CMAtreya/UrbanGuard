import pandas as pd
import joblib

model = joblib.load("road_risk_model.pkl")

sample = pd.DataFrame(
    [[12.9352, 77.6012, 0.91, 14, 20]],
    columns=["lat", "lng", "confidence", "hour", "day"],
)

prediction = model.predict(sample)
print("Prediction:", prediction)

if prediction[0] == 0:
    print("Meaning: Safer road")
else:
    print("Meaning: Risky road")
