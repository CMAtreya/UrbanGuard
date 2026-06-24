from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
import requests
from pydantic import BaseModel, Field
from datetime import datetime
from pathlib import Path
import joblib

app = FastAPI()

ROAD_RISK_MODEL_PATH = Path(__file__).with_name("road_risk_model.pkl")
VIBRATION_MODEL_PATH = Path(__file__).with_name("pothole_vibration_model.pkl")

road_risk_model = joblib.load(ROAD_RISK_MODEL_PATH) if ROAD_RISK_MODEL_PATH.exists() else None
vibration_model = joblib.load(VIBRATION_MODEL_PATH) if VIBRATION_MODEL_PATH.exists() else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary database (in memory)
events = []


class EventSocketManager:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, payload: dict):
        stale_connections = []

        for connection in self.connections:
            try:
                await connection.send_json(payload)
            except Exception:
                stale_connections.append(connection)

        for connection in stale_connections:
            self.disconnect(connection)


socket_manager = EventSocketManager()

# Data model
class Event(BaseModel):
    device_id: str
    event_type: str
    lat: float
    lng: float
    confidence: float
    ax: float
    ay: float
    az: float
    magnitude: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# POST → Add event
@app.post("/api/event")
async def add_event(event: Event):
    data = jsonable_encoder(event)
    events.append(data)

    await socket_manager.broadcast({
        "type": "event_added",
        "event": data,
    })

    return {"message": "Event added successfully"}

# GET → Get all events
@app.get("/api/events")
def get_events():
    return {"events": events}


@app.websocket("/ws/events")
async def events_websocket(websocket: WebSocket):
    await socket_manager.connect(websocket)

    await websocket.send_json({
        "type": "snapshot",
        "events": events,
    })

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket)
    except Exception:
        socket_manager.disconnect(websocket)


@app.get("/events")
def get_events_compat():
    return events


@app.get("/api/geocode")
def geocode_location(query: str):
    encoded_query = query.strip()
    if not encoded_query:
        raise HTTPException(status_code=400, detail="query is required")

    response = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"format": "jsonv2", "limit": 1, "q": encoded_query},
        headers={"User-Agent": "UrbanGuard/1.0"},
        timeout=10,
    )

    response.raise_for_status()
    results = response.json()

    if not isinstance(results, list) or len(results) == 0:
        raise HTTPException(status_code=404, detail=f"Location not found: {query}")

    first_result = results[0]
    return {
        "lat": float(first_result["lat"]),
        "lng": float(first_result["lon"]),
    }


@app.get("/predict-road-risk")
def predict_road_risk(
    lat: float,
    lng: float,
    confidence: float,
    hour: int | None = None,
    day: int | None = None,
):
    if road_risk_model is None:
        raise HTTPException(status_code=503, detail="Road-risk model not trained yet. Run train_model.py first.")

    now = datetime.utcnow()
    feature_hour = now.hour if hour is None else hour
    feature_day = now.day if day is None else day

    pred = road_risk_model.predict([[lat, lng, confidence, feature_hour, feature_day]])
    return {"prediction": int(pred[0])}


@app.get("/predict")
def predict_compat(
    lat: float,
    lng: float,
    confidence: float,
    hour: int | None = None,
    day: int | None = None,
):
    return predict_road_risk(lat=lat, lng=lng, confidence=confidence, hour=hour, day=day)


@app.get("/detect-pothole")
def detect_pothole(
    ax: float,
    ay: float,
    az: float,
    magnitude: float,
    jerk: float,
    intensity: float,
):
    if vibration_model is None:
        raise HTTPException(status_code=503, detail="Vibration model not trained yet. Run train_vibration_model.py first.")

    pred = vibration_model.predict([[ax, ay, az, magnitude, jerk, intensity]])
    return {"prediction": int(pred[0])}