import pandas as pd
import joblib


model = joblib.load("pothole_vibration_model.pkl")

sample = pd.DataFrame(
	[[2.25, 2.05, 2.45, 3.81, 0.64, 6.75]],
	columns=["ax", "ay", "az", "magnitude", "jerk", "intensity"],
)

prediction = model.predict(sample)
print("Prediction:", prediction)

if prediction[0] == 1:
	print("Meaning: Pothole vibration detected")
else:
	print("Meaning: No pothole detected")