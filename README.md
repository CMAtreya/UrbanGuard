# UrbanGuard

UrbanGuard is an AI-powered smart street system for live road event monitoring, route-aware vehicle simulation, and pothole risk prediction.

It combines a FastAPI backend, a React + Vite dashboard, Leaflet maps, and a lightweight ML pipeline to visualize and analyze road conditions in real time.

## What This Prototype Does

- Shows live pothole, crash, and speed breaker events on a map
- Displays a heatmap of danger zones
- Simulates a vehicle moving on the shortest road route between two points
- Highlights potholes ahead of the vehicle with an on-map warning
- Lets users toggle a predicted risk zones layer
- Trains a simple ML model from exported event data
- Exposes a prediction API for road-risk classification

## Tech Stack

- Frontend: React, Vite, React Leaflet, Framer Motion
- Backend: FastAPI, Pydantic
- ML: pandas, scikit-learn, joblib
- Mapping: OpenStreetMap, OSRM, Nominatim

## Project Flow

Vehicle or device data enters the system, the backend stores it, the dashboard updates live, and the ML layer predicts road-risk zones from historical event patterns.

## Local Setup

### Backend

```bash
cd backend
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend-new
npm install
npm run dev
```

## Data and Model Pipeline

### 1. Export event data

```bash
cd backend
python export_data.py
```

### 2. Train the model

```bash
cd backend
python train_model.py
```

This creates `pothole_model.pkl`, which is used by the prediction API.

### 3. Prediction endpoint

```http
GET /predict?lat=...&lng=...&confidence=...
```

Returns a class label for the location risk prediction.

## Repository Structure

```text
UrbanGuard/
	backend/
		main.py
		fake_data.py
		export_data.py
		train_model.py
	frontend-new/
		src/
		package.json
```

## Planned Hardware Deployment

The long-term version of UrbanGuard is designed for a vehicle-mounted device that streams sensor data to the backend. The intended hardware path is:

- ESP32-S3 controller
- MPU6050 vibration sensor
- Neo-6M GPS module
- ESP32-CAM for image capture
- BLE gateway through a phone

## Git Workflow

```bash
git checkout main
git pull
git checkout -b feature/your-change
git add .
git commit -m "Describe your change"
git push -u origin feature/your-change
```

## Notes

- Generated artifacts such as `road_data.csv` and `pothole_model.pkl` are not meant to be edited manually.
- The current implementation uses simulated live data for the dashboard and route movement.
- The hardware deployment is the next phase of the project.