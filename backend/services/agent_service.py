import os
import httpx
from datetime import datetime
from services import supabase_service
from services.prediction_service import haversine

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# Memory cache for agent summaries: key is "lat_bucket,lng_bucket", value is the dict response
_summary_cache = {}

async def get_road_summary(lat: float, lng: float, radius_m: float = 500.0) -> dict:
    # 1. Check cache first. Round coordinates to 4 decimal places (~11 meters precision)
    cache_key = f"{lat:.4f},{lng:.4f}"
    if cache_key in _summary_cache:
        return _summary_cache[cache_key]
        
    events = supabase_service.get_events()
    nearby = []
    
    for e in events:
        try:
            e_lat = float(e.get("lat"))
            e_lng = float(e.get("lng"))
            # Quick bounding box check
            if abs(e_lat - lat) < 0.01 and abs(e_lng - lng) < 0.01:
                dist = haversine(lat, lng, e_lat, e_lng)
                if dist <= radius_m:
                    nearby.append(e)
        except (TypeError, ValueError):
            continue
            
    if not nearby:
        res = {
            "summary": "No road events detected within 500m. Road conditions appear clear and safe.",
            "risk_level": "LOW",
            "nearby_events": 0,
            "recommendation": "Proceed at normal speed limits."
        }
        _summary_cache[cache_key] = res
        return res
        
    # Analyze events
    event_counts = {}
    total_magnitude = 0.0
    for e in nearby:
        t = e.get("event_type", "unknown")
        event_counts[t] = event_counts.get(t, 0) + 1
        total_magnitude += float(e.get("magnitude", 0))
        
    avg_mag = round(total_magnitude / len(nearby), 2)
    count = len(nearby)
    
    # Calculate risk level
    if count > 5 or avg_mag > 8.0:
        risk_level = "HIGH"
        recommendation = "Avoid this route or reduce speed significantly (under 20 km/h)."
    elif count > 2 or avg_mag > 4.0:
        risk_level = "MEDIUM"
        recommendation = "Proceed with caution, keep speed under 35 km/h, and watch for potholes."
    else:
        risk_level = "LOW"
        recommendation = "Road conditions are stable, normal speed is fine but remain alert."
        
    # Check Gemini API Key
    if not GEMINI_API_KEY:
        dominant_types = [f"{v} {k}(s)" for k, v in event_counts.items()]
        summary_text = (
            f"Detected {count} road events in close proximity, including {', '.join(dominant_types)}. "
            f"Average vibration magnitude measured at {avg_mag} m/s². "
            f"Caution is advised when driving through this sector."
        )
        res = {
            "summary": summary_text,
            "risk_level": risk_level,
            "nearby_events": count,
            "recommendation": recommendation
        }
        _summary_cache[cache_key] = res
        return res

    # Generate summary with Gemini 2.0 Flash
    prompt = f"""You are UrbanGuard's road intelligence agent for Indian cities.

Nearby road events within 500m of ({lat:.4f}, {lng:.4f}):
- Event breakdown: {event_counts}
- Total events: {count}
- Average vibration magnitude: {avg_mag} m/s²

Write a 2-3 sentence road condition summary for a driver approaching this area.
Be specific about hazard types and urgency. End with a recommended speed.
Do not use bullet points. Write naturally like a navigation assistant."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 200},
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10.0
            )
            
        if resp.status_code == 200:
            resp_json = resp.json()
            text = resp_json["candidates"][0]["content"]["parts"][0]["text"].strip()
            res = {
                "summary": text,
                "risk_level": risk_level,
                "nearby_events": count,
                "recommendation": recommendation
            }
            _summary_cache[cache_key] = res
            return res
        else:
            print(f"Gemini API request failed with status {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        
    # Fallback in case of call failure
    dominant_types = [f"{v} {k}(s)" for k, v in event_counts.items()]
    summary_text = (
        f"Detected {count} road events in close proximity, including {', '.join(dominant_types)}. "
        f"Average vibration magnitude measured at {avg_mag} m/s². "
        f"Caution is advised when driving through this sector."
    )
    res = {
        "summary": summary_text,
        "risk_level": risk_level,
        "nearby_events": count,
        "recommendation": recommendation
    }
    _summary_cache[cache_key] = res
    return res
