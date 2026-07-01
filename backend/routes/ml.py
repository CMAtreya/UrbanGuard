import json
import math
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from services import prediction_service, supabase_service

router = APIRouter()

BACKEND_DIR = Path(__file__).parent.parent
ROAD_RISK_METRICS_PATH = BACKEND_DIR / "road_risk_metrics.json"
VIBRATION_METRICS_PATH = BACKEND_DIR / "vibration_metrics.json"

@router.get("/api/ml-stats")
def get_ml_stats():
    road_metrics = None
    vibration_metrics = None
    
    if ROAD_RISK_METRICS_PATH.exists():
        try:
            with open(ROAD_RISK_METRICS_PATH, "r") as f:
                road_metrics = json.load(f)
        except Exception as e:
            print(f"Error reading road risk metrics: {e}")
            
    if VIBRATION_METRICS_PATH.exists():
        try:
            with open(VIBRATION_METRICS_PATH, "r") as f:
                vibration_metrics = json.load(f)
        except Exception as e:
            print(f"Error reading vibration metrics: {e}")
            
    return {
        "road_model": road_metrics,
        "road_risk": road_metrics,
        "vibration_model": vibration_metrics,
        "vibration": vibration_metrics
    }

@router.get("/predict-road-risk")
def predict_road_risk(
    lat: float,
    lng: float,
    confidence: float,
    hour: int | None = None,
    day: int | None = None,
):
    try:
        pred = prediction_service.predict_road_risk(lat, lng, confidence, hour, day)
        return {"prediction": pred}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

@router.get("/predict")
def predict_compat(
    lat: float,
    lng: float,
    confidence: float,
    hour: int | None = None,
    day: int | None = None,
):
    return predict_road_risk(lat=lat, lng=lng, confidence=confidence, hour=hour, day=day)

@router.get("/detect-pothole")
def detect_pothole(
    ax: float,
    ay: float,
    az: float,
    magnitude: float,
    jerk: float,
    intensity: float,
):
    try:
        pred = prediction_service.detect_pothole(ax, ay, az, magnitude, jerk, intensity)
        return {"prediction": pred}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── Prediction Heatmap Grid ──────────────────────────────────────────────────

def _haversine_m(lat1, lng1, lat2, lng2):
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.get("/api/ml/prediction-grid")
def get_prediction_grid(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: float = Query(3000, ge=500, le=10000),
    step: float = Query(400, ge=100, le=1000),
):
    """
    Generate a grid of ML-predicted risk levels around (lat, lng).
    Each grid point gets a risk_level: LOW / MEDIUM / HIGH based on
    the trained road-risk model + nearby event density.
    """
    now = datetime.utcnow()
    events = supabase_service.get_events()

    steps_count = int(radius / step)
    lat_step = step / 111_320
    lng_step = step / (111_320 * math.cos(math.radians(lat)))

    grid = []
    for i in range(-steps_count, steps_count + 1):
        for j in range(-steps_count, steps_count + 1):
            g_lat = round(lat + i * lat_step, 6)
            g_lng = round(lng + j * lng_step, 6)
            if _haversine_m(lat, lng, g_lat, g_lng) > radius:
                continue

            # Count nearby events for this grid cell
            cell_radius = step * 0.6
            event_count = 0
            severity_score = 0.0
            for ev in events:
                try:
                    e_lat = float(ev.get("lat", 0))
                    e_lng = float(ev.get("lng", 0))
                except (TypeError, ValueError):
                    continue
                if abs(g_lat - e_lat) > 0.01 or abs(g_lng - e_lng) > 0.01:
                    continue
                if _haversine_m(g_lat, g_lng, e_lat, e_lng) <= cell_radius:
                    event_count += 1
                    etype = str(ev.get("event_type", "")).lower()
                    severity_score += 3 if etype == "crash" else 2 if etype == "pothole" else 1

            # Try ML prediction first, fall back to event density
            try:
                pred = prediction_service.predict_road_risk(
                    g_lat, g_lng, confidence=0.85, hour=now.hour, day=now.day
                )
                # Combine ML prediction with event density
                density_risk = min(1.0, severity_score / 20)
                ml_risk = pred  # 0 or 1
                combined = (ml_risk * 0.6) + (density_risk * 0.4)
            except Exception:
                # Fallback: pure event density
                combined = min(1.0, severity_score / 20)

            if combined >= 0.6:
                risk_level = "HIGH"
            elif combined >= 0.3:
                risk_level = "MEDIUM"
            else:
                risk_level = "LOW"

            grid.append({
                "lat": g_lat,
                "lng": g_lng,
                "risk_score": round(combined, 3),
                "risk_level": risk_level,
                "event_count": event_count,
            })

    return {
        "center": [lat, lng],
        "radius_m": radius,
        "step_m": step,
        "grid": grid,
        "total_points": len(grid),
    }

