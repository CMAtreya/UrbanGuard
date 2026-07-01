import joblib
from pathlib import Path
from math import radians, sin, cos, sqrt, atan2
from datetime import datetime
from services import supabase_service

BACKEND_DIR = Path(__file__).parent.parent
ROAD_RISK_MODEL_PATH = BACKEND_DIR / "road_risk_model.pkl"
VIBRATION_MODEL_PATH = BACKEND_DIR / "pothole_vibration_model.pkl"

# Lazy load models
_road_risk_model = None
_vibration_model = None

def get_road_risk_model():
    global _road_risk_model
    if _road_risk_model is None:
        if ROAD_RISK_MODEL_PATH.exists():
            try:
                _road_risk_model = joblib.load(ROAD_RISK_MODEL_PATH)
            except Exception as e:
                print(f"Error loading road risk model: {e}")
    return _road_risk_model

def get_vibration_model():
    global _vibration_model
    if _vibration_model is None:
        if VIBRATION_MODEL_PATH.exists():
            try:
                _vibration_model = joblib.load(VIBRATION_MODEL_PATH)
            except Exception as e:
                print(f"Error loading vibration model: {e}")
    return _vibration_model

def haversine(lat1, lng1, lat2, lng2):
    R = 6371000 # Earth radius in meters
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlam = radians(lng2 - lng1)
    a = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlam/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

def compute_nearby_stats(lat: float, lng: float, radius_m: float = 500.0):
    events = supabase_service.get_events()
    count = 0
    severity_score = 0.0
    
    for e in events:
        try:
            e_lat = float(e.get("lat"))
            e_lng = float(e.get("lng"))
            if abs(e_lat - lat) < 0.01 and abs(e_lng - lng) < 0.01:
                dist = haversine(lat, lng, e_lat, e_lng)
                if dist <= radius_m:
                    count += 1
                    event_type = str(e.get("event_type", "")).lower()
                    # crash = 3, pothole = 2, speed breaker = 1
                    weight = 3 if event_type == "crash" else 2 if event_type == "pothole" else 1
                    severity_score += weight
        except (TypeError, ValueError):
            continue
            
    return count, severity_score

def predict_road_risk(lat: float, lng: float, confidence: float, hour: int | None = None, day: int | None = None) -> int:
    model = get_road_risk_model()
    if model is None:
        raise ValueError("Road risk model is not trained or loaded. Please run train_model.py first.")
        
    now = datetime.utcnow()
    feature_hour = now.hour if hour is None else hour
    feature_day = now.day if day is None else day
    
    # Calculate event_count and severity_score dynamically
    event_count, severity_score = compute_nearby_stats(lat, lng, radius_m=500.0)
    
    # Feature columns: ["event_count", "severity_score", "confidence", "hour", "day"]
    features = [[event_count, severity_score, confidence, feature_hour, feature_day]]
    prediction = model.predict(features)
    return int(prediction[0])

def detect_pothole(ax: float, ay: float, az: float, magnitude: float, jerk: float, intensity: float) -> int:
    model = get_vibration_model()
    if model is None:
        raise ValueError("Vibration model is not trained or loaded. Please run train_vibration_model.py first.")
        
    # Feature columns: ["ax", "ay", "az", "magnitude", "jerk", "intensity"]
    features = [[ax, ay, az, magnitude, jerk, intensity]]
    prediction = model.predict(features)
    return int(prediction[0])
