# UrbanGuard

UrbanGuard is a smart road-safety dashboard that combines a FastAPI backend, a React + Vite frontend, live event simulation, route-based vehicle movement, heatmaps, and ML-based risk prediction.

## Project Structure

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

## Features

- Live pothole and crash event visualization
- Heatmap overlay for danger zones
- Route-based vehicle simulation on the shortest road path
- Pothole-ahead warning on the vehicle marker
- Predicted Risk Zones layer
- FastAPI prediction endpoint powered by a trained model

## Backend Setup

Open a terminal in `backend` and run:

```bash
uvicorn main:app --reload
```

Backend endpoints:

- `GET /api/events` - returns all events
- `GET /events` - compatibility endpoint returning the raw list
- `GET /predict?lat=...&lng=...&confidence=...` - returns the predicted class

## Frontend Setup

Open a terminal in `frontend-new` and run:

```bash
npm install
npm run dev
```

The frontend uses:

- React
- Vite
- React Leaflet
- Leaflet heatmap layer
- Framer Motion

## Generate Dataset

From the `backend` folder:

```bash
python fake_data.py
python export_data.py
```

This saves the current events to `road_data.csv`.

## Train Model

From the `backend` folder:

```bash
python train_model.py
```

This creates `pothole_model.pkl`.

## Git Workflow

Typical day-to-day flow:

```bash
git checkout main
git pull
git checkout -b feature/your-change
# edit files
git add .
git commit -m "Describe your change"
git push -u origin feature/your-change
```

If you are pushing an existing local project to a new empty GitHub repo:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

If GitHub already has an initial commit and push is rejected:

```bash
git pull origin main --allow-unrelated-histories --no-rebase
git push -u origin main
```

## Notes

- Do not commit `backend/venv`, `frontend-new/node_modules`, or generated model/data files unless you explicitly want them tracked.
- The current vehicle movement is route-based and uses OSRM for shortest-road routing.
- Predicted Risk Zones can be toggled from the dashboard.