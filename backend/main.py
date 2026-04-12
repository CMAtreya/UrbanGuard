from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime

app = FastAPI()

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