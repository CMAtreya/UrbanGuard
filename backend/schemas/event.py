from pydantic import BaseModel, Field
from datetime import datetime

class EventBase(BaseModel):
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
    severity: str | None = None
    description: str | None = None

class EventCreate(EventBase):
    pass

class EventResponse(EventBase):
    id: int | str | None = None

    class Config:
        from_attributes = True
