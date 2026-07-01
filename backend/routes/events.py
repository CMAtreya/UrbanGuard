from fastapi import APIRouter, HTTPException, Query
from fastapi.encoders import jsonable_encoder
import requests
from schemas.event import EventCreate
from services import supabase_service
from services.websocket_service import socket_manager

router = APIRouter()


# ─── Nearby events (location-aware) ──────────────────────────────────────────

@router.get("/api/events/nearby")
def get_events_nearby(
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    radius: float = Query(5000, description="Search radius in metres", ge=100, le=50_000),
):
    """Return anomalies within *radius* metres of the supplied coordinates."""
    if not (-90 <= lat <= 90):
        raise HTTPException(status_code=422, detail="lat must be between -90 and 90")
    if not (-180 <= lng <= 180):
        raise HTTPException(status_code=422, detail="lng must be between -180 and 180")

    nearby = supabase_service.get_events_nearby(lat, lng, radius)

    # Build per-type counts for the frontend stats panel
    counts: dict[str, int] = {}
    for event in nearby:
        etype = str(event.get("event_type", "unknown"))
        counts[etype] = counts.get(etype, 0) + 1

    no_anomalies = len(nearby) == 0

    return {
        "events": nearby,
        "count": len(nearby),
        "user_lat": lat,
        "user_lng": lng,
        "radius_m": radius,
        "type_counts": counts,
        "no_anomalies": no_anomalies,
        "message": (
            "No road anomalies detected near your location."
            if no_anomalies
            else f"Found {len(nearby)} anomalies within {radius / 1000:.1f} km."
        ),
    }


# ─── All events ───────────────────────────────────────────────────────────────

@router.get("/api/events")
def get_events():
    events = supabase_service.get_events()
    return {"events": events}

# Compatibility endpoint
@router.get("/events")
def get_events_compat():
    return supabase_service.get_events()

@router.post("/api/event")
async def add_event(event: EventCreate):
    data = jsonable_encoder(event)
    saved_event = supabase_service.add_event(data)
    
    await socket_manager.broadcast({
        "type": "event_added",
        "event": saved_event,
    })
    
    return {"message": "Event added successfully", "event": saved_event}

# Support both singular and plural POST endpoint
@router.post("/api/events")
async def add_events_bulk(event: EventCreate):
    return await add_event(event)

@router.delete("/api/events/{id}")
def delete_event(id: str):
    success = supabase_service.delete_event(id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Event with id {id} not found")
    return {"message": "Event deleted successfully"}

@router.get("/api/geocode")
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

