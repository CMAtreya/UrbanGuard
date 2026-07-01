"""
Analytics endpoints — road health score + aggregate summary.
"""

import math
from datetime import datetime, timedelta
from collections import Counter
from fastapi import APIRouter, Query
from services import supabase_service

router = APIRouter()


# ── Haversine ─────────────────────────────────────────────────────────────────

def _haversine_m(lat1, lng1, lat2, lng2):
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Road Health Score ─────────────────────────────────────────────────────────

def _health_grade(score: int) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 40:
        return "Moderate"
    return "Dangerous"


@router.get("/api/analytics/road-health")
def get_road_health(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: float = Query(500, ge=50, le=5000),
):
    """
    Compute a 0-100 road health score for a circular area.
    Score = 100 – min(100, crash×15 + pothole×8 + speed_breaker×2)
    """
    events = supabase_service.get_events()
    crash_count = 0
    pothole_count = 0
    breaker_count = 0

    for ev in events:
        try:
            e_lat, e_lng = float(ev.get("lat", 0)), float(ev.get("lng", 0))
        except (TypeError, ValueError):
            continue
        if abs(lat - e_lat) > 0.02 or abs(lng - e_lng) > 0.02:
            continue
        if _haversine_m(lat, lng, e_lat, e_lng) <= radius:
            etype = str(ev.get("event_type", "")).lower()
            if etype == "crash":
                crash_count += 1
            elif etype == "pothole":
                pothole_count += 1
            elif etype == "speed_breaker":
                breaker_count += 1

    penalty = crash_count * 15 + pothole_count * 8 + breaker_count * 2
    score = max(0, 100 - min(100, penalty))
    grade = _health_grade(score)

    return {
        "lat": lat,
        "lng": lng,
        "radius_m": radius,
        "score": score,
        "grade": grade,
        "crash_count": crash_count,
        "pothole_count": pothole_count,
        "speed_breaker_count": breaker_count,
    }


@router.get("/api/analytics/road-health-grid")
def get_road_health_grid(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: float = Query(3000, ge=500, le=10000),
    step: float = Query(400, ge=100, le=1000),
):
    """
    Return a grid of health scores around a centre point.
    """
    events = supabase_service.get_events()

    # Build grid
    steps_count = int(radius / step)
    lat_step = step / 111_320
    lng_step = step / (111_320 * math.cos(math.radians(lat)))

    grid = []
    for i in range(-steps_count, steps_count + 1):
        for j in range(-steps_count, steps_count + 1):
            g_lat = lat + i * lat_step
            g_lng = lng + j * lng_step
            if _haversine_m(lat, lng, g_lat, g_lng) > radius:
                continue

            crash_c = pothole_c = breaker_c = 0
            cell_radius = step * 0.6
            for ev in events:
                try:
                    e_lat, e_lng = float(ev.get("lat", 0)), float(ev.get("lng", 0))
                except (TypeError, ValueError):
                    continue
                if abs(g_lat - e_lat) > 0.01 or abs(g_lng - e_lng) > 0.01:
                    continue
                if _haversine_m(g_lat, g_lng, e_lat, e_lng) <= cell_radius:
                    etype = str(ev.get("event_type", "")).lower()
                    if etype == "crash":
                        crash_c += 1
                    elif etype == "pothole":
                        pothole_c += 1
                    elif etype == "speed_breaker":
                        breaker_c += 1

            penalty = crash_c * 15 + pothole_c * 8 + breaker_c * 2
            score = max(0, 100 - min(100, penalty))
            grid.append({
                "lat": round(g_lat, 6),
                "lng": round(g_lng, 6),
                "score": score,
                "grade": _health_grade(score),
            })

    return {"center": [lat, lng], "radius_m": radius, "step_m": step, "grid": grid}


# ── Analytics Summary ─────────────────────────────────────────────────────────

@router.get("/api/analytics/summary")
def get_analytics_summary():
    """
    Aggregate statistics across all known events.
    """
    events = supabase_service.get_events()
    total = len(events)

    type_counts = Counter()
    area_counts: dict[str, int] = {}
    hourly_trend = [0] * 24
    today_count = 0
    severity_sum = 0
    now = datetime.utcnow()

    for ev in events:
        etype = str(ev.get("event_type", "unknown")).lower()
        type_counts[etype] += 1

        # Hourly trend
        ts_str = ev.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00").replace("+00:00", ""))
        except Exception:
            ts = now
        hourly_trend[ts.hour % 24] += 1

        # Today
        if ts.date() == now.date():
            today_count += 1

        # Cluster area detection (round to ~500m grid)
        try:
            e_lat = round(float(ev.get("lat", 0)), 3)
            e_lng = round(float(ev.get("lng", 0)), 3)
            area_key = f"{e_lat},{e_lng}"
            area_counts[area_key] = area_counts.get(area_key, 0) + 1
        except (TypeError, ValueError):
            pass

        # severity accumulation for avg score
        sev = str(ev.get("severity", "LOW")).upper()
        severity_sum += 3 if sev == "HIGH" else 2 if sev == "MEDIUM" else 1

    # Most dangerous area
    most_dangerous_key = max(area_counts, key=area_counts.get) if area_counts else "N/A"
    most_dangerous_count = area_counts.get(most_dangerous_key, 0)

    # Approximate known area labels (Bengaluru demo)
    area_labels = {
        "12.845,77.586": "Silk Board Junction",
        "12.935,77.601": "MG Road",
        "12.957,77.723": "ORR (Outer Ring Road)",
        "12.839,77.679": "Electronic City",
        "12.930,77.631": "Koramangala",
        "12.970,77.684": "Whitefield – Marathahalli",
    }
    most_dangerous_area = area_labels.get(most_dangerous_key, f"Area {most_dangerous_key}")

    # Average road score (inverse of avg severity)
    avg_severity = severity_sum / total if total > 0 else 1
    avg_road_score = max(0, int(100 - (avg_severity / 3) * 60))

    return {
        "total_events": total,
        "total_potholes": type_counts.get("pothole", 0),
        "total_crashes": type_counts.get("crash", 0),
        "total_speed_breakers": type_counts.get("speed_breaker", 0),
        "most_dangerous_area": most_dangerous_area,
        "most_dangerous_count": most_dangerous_count,
        "avg_road_score": avg_road_score,
        "today_detections": today_count,
        "hourly_trend": hourly_trend,
        "event_type_distribution": dict(type_counts),
    }
