from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
from pydantic import BaseModel, Field
from datetime import datetime
from pathlib import Path
from typing import Optional
import joblib

app = FastAPI()

MODEL_PATH = Path(__file__).with_name("pothole_model.pkl")
model = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary database (in memory)
events = []

# Data model
class Event(BaseModel):
    device_id: str
    event_type: str
    lat: float
    lng: float
    confidence: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# POST → Add event
@app.post("/api/event")
def add_event(event: Event):
    data = event.dict()
    events.append(data)
    return {"message": "Event added successfully"}

# GET → Get all events
@app.get("/api/events")
def get_events():
    return {"events": events}


@app.get("/events")
def get_events_compat():
    return events


@app.get("/predict")
def predict(
    lat: float,
    lng: float,
    confidence: float,
    hour: Optional[int] = None,
    day: Optional[int] = None,
):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not trained yet. Run train_model.py first.")

    now = datetime.utcnow()
    feature_hour = now.hour if hour is None else hour
    feature_day = now.day if day is None else day

    pred = model.predict([[lat, lng, confidence, feature_hour, feature_day]])
    return {"prediction": int(pred[0])}