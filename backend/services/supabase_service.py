import os
import uuid
import math
from datetime import datetime
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize Supabase client: {e}")

# In-memory fallback database
_in_memory_events = []
_id_counter = 1

def compute_severity_and_desc(event_data: dict) -> dict:
    # Compute default severity
    event_type = str(event_data.get("event_type", "")).lower()
    magnitude = float(event_data.get("magnitude", 0))
    
    if event_type == "crash":
        severity = "HIGH"
        description = f"Vehicle crash reported (vibration magnitude: {magnitude:.2f} m/s²)."
    elif event_type == "pothole":
        if magnitude > 8.0:
            severity = "HIGH"
            description = f"Severe pothole detected (vibration magnitude: {magnitude:.2f} m/s²)."
        else:
            severity = "MEDIUM"
            description = f"Moderate pothole detected (vibration magnitude: {magnitude:.2f} m/s²)."
    else:
        severity = "LOW"
        description = f"Road event: {event_type} (vibration magnitude: {magnitude:.2f} m/s²)."
        
    if not event_data.get("severity"):
        event_data["severity"] = severity
    if not event_data.get("description"):
        event_data["description"] = description
        
    return event_data

def get_events() -> list[dict]:
    if supabase_client:
        try:
            response = supabase_client.table("events").select("*").execute()
            # return response data
            return response.data if response.data else []
        except Exception as e:
            print(f"Supabase get_events error: {e}. Falling back to in-memory data.")
            
    return _in_memory_events

def add_event(event_data: dict) -> dict:
    global _id_counter
    # Format timestamp
    if isinstance(event_data.get("timestamp"), datetime):
        event_data["timestamp"] = event_data["timestamp"].isoformat()
    elif not event_data.get("timestamp"):
        event_data["timestamp"] = datetime.utcnow().isoformat()
        
    event_data = compute_severity_and_desc(event_data)
    
    if supabase_client:
        try:
            # Insert and get response
            response = supabase_client.table("events").insert(event_data).execute()
            if response.data:
                return response.data[0]
        except Exception as e:
            print(f"Supabase add_event error: {e}. Falling back to in-memory storage.")
            
    # Fallback to in-memory
    new_event = dict(event_data)
    new_event["id"] = _id_counter
    _id_counter += 1
    _in_memory_events.append(new_event)
    return new_event

def delete_event(event_id: str | int) -> bool:
    global _in_memory_events
    
    deleted_from_supabase = False
    if supabase_client:
        try:
            # Determine if it's integer or string ID
            try:
                id_val = int(event_id)
            except ValueError:
                id_val = event_id
                
            response = supabase_client.table("events").delete().eq("id", id_val).execute()
            if response.data:
                deleted_from_supabase = True
        except Exception as e:
            print(f"Supabase delete_event error: {e}.")
            
    # Also delete from memory cache in case of mixed usage or fallback
    initial_len = len(_in_memory_events)
    # Check both string and integer formats
    _in_memory_events = [e for e in _in_memory_events if str(e.get("id")) != str(event_id)]
    deleted_from_memory = len(_in_memory_events) < initial_len
    
    return deleted_from_supabase or deleted_from_memory


# ─── Haversine helper ────────────────────────────────────────────────────────

def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in metres between two WGS-84 points."""
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_events_nearby(lat: float, lng: float, radius_m: float = 5000) -> list[dict]:
    """Return all events within *radius_m* metres of (lat, lng)."""
    all_events = get_events()
    nearby: list[dict] = []
    for event in all_events:
        try:
            e_lat = float(event.get("lat", 0))
            e_lng = float(event.get("lng", 0))
        except (TypeError, ValueError):
            continue
        dist = _haversine_meters(lat, lng, e_lat, e_lng)
        if dist <= radius_m:
            event_copy = dict(event)
            event_copy["distance_m"] = round(dist, 1)
            nearby.append(event_copy)
    # Sort closest first
    nearby.sort(key=lambda e: e["distance_m"])
    return nearby
