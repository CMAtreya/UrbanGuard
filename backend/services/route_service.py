"""
Route analysis service — geocode endpoints, fetch OSRM alternatives,
score each route against known anomalies, and classify them.
"""

import math
import requests
from services import supabase_service

# ── Haversine ─────────────────────────────────────────────────────────────────

def _haversine_m(lat1, lng1, lat2, lng2):
    """Great-circle distance in metres."""
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Geocode via Nominatim ─────────────────────────────────────────────────────

def geocode_text(query: str) -> tuple[float, float]:
    """Return (lat, lng) for a free-text location query."""
    query = query.strip()
    # Check if already coordinates
    if "," in query:
        parts = query.split(",")
        if len(parts) == 2:
            try:
                lat, lng = float(parts[0].strip()), float(parts[1].strip())
                if -90 <= lat <= 90 and -180 <= lng <= 180:
                    return (lat, lng)
            except ValueError:
                pass

    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"format": "jsonv2", "limit": 1, "q": query},
        headers={"User-Agent": "UrbanGuard/1.0"},
        timeout=10,
    )
    resp.raise_for_status()
    results = resp.json()
    if not results:
        raise ValueError(f"Location not found: {query}")
    return (float(results[0]["lat"]), float(results[0]["lon"]))


# ── Fetch OSRM route alternatives ────────────────────────────────────────────

def fetch_osrm_routes(
    src_lat: float, src_lng: float, dst_lat: float, dst_lng: float
) -> list[dict]:
    """
    Get up to 3 route alternatives from the public OSRM server.
    Returns list of dicts with keys: waypoints, distance_km, duration_min.
    """
    url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{src_lng},{src_lat};{dst_lng},{dst_lat}"
        f"?overview=full&geometries=geojson&alternatives=3&steps=false"
    )
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    routes_raw = data.get("routes", [])
    if not routes_raw:
        raise ValueError("No drivable routes found between source and destination.")

    routes = []
    for r in routes_raw:
        coords = r.get("geometry", {}).get("coordinates", [])
        waypoints = [[lat, lng] for lng, lat in coords]  # GeoJSON is [lng,lat]
        routes.append({
            "waypoints": waypoints,
            "distance_km": round(r.get("distance", 0) / 1000, 2),
            "duration_min": round(r.get("duration", 0) / 60, 1),
        })
    return routes


# ── Sample waypoints at fixed intervals ───────────────────────────────────────

def _sample_waypoints(waypoints: list[list[float]], step_m: float = 200) -> list[list[float]]:
    """Sample points along a polyline at approximately every `step_m` metres."""
    if len(waypoints) < 2:
        return waypoints

    sampled = [waypoints[0]]
    acc = 0.0
    for i in range(1, len(waypoints)):
        d = _haversine_m(
            waypoints[i - 1][0], waypoints[i - 1][1],
            waypoints[i][0], waypoints[i][1],
        )
        acc += d
        if acc >= step_m:
            sampled.append(waypoints[i])
            acc = 0.0
    # Always include the last point
    if sampled[-1] != waypoints[-1]:
        sampled.append(waypoints[-1])
    return sampled


# ── Score a single route ──────────────────────────────────────────────────────

def score_route(waypoints: list[list[float]], events: list[dict], scan_radius_m: float = 100) -> dict:
    """
    Count anomalies near a route and compute safety/risk scores.
    Returns: { anomaly_count, pothole_count, crash_count, risk_score, safety_score, smoothness_score }
    """
    sampled = _sample_waypoints(waypoints, step_m=200)

    pothole_count = 0
    crash_count = 0
    breaker_count = 0
    # Deduplicate events so the same event isn't counted twice from overlapping samples
    counted_ids = set()

    for wp in sampled:
        for ev in events:
            ev_id = ev.get("id") or f"{ev.get('lat')}_{ev.get('lng')}_{ev.get('timestamp','')}"
            if ev_id in counted_ids:
                continue
            try:
                e_lat = float(ev.get("lat", 0))
                e_lng = float(ev.get("lng", 0))
            except (TypeError, ValueError):
                continue
            # Quick bounding-box pre-filter before expensive haversine
            if abs(wp[0] - e_lat) > 0.002 or abs(wp[1] - e_lng) > 0.002:
                continue
            if _haversine_m(wp[0], wp[1], e_lat, e_lng) <= scan_radius_m:
                counted_ids.add(ev_id)
                etype = str(ev.get("event_type", "")).lower()
                if etype == "pothole":
                    pothole_count += 1
                elif etype == "crash":
                    crash_count += 1
                elif etype == "speed_breaker":
                    breaker_count += 1

    anomaly_count = pothole_count + crash_count + breaker_count

    # Weighted penalty: crash = 15, pothole = 8, speed_breaker = 2
    penalty = crash_count * 15 + pothole_count * 8 + breaker_count * 2
    risk_score = min(100, penalty)
    safety_score = max(0, 100 - risk_score)

    # Smoothness: penalise potholes and breakers more heavily
    roughness = pothole_count * 10 + breaker_count * 5
    smoothness_score = max(0, 100 - min(100, roughness))

    return {
        "anomaly_count": anomaly_count,
        "pothole_count": pothole_count,
        "crash_count": crash_count,
        "speed_breaker_count": breaker_count,
        "risk_score": risk_score,
        "safety_score": safety_score,
        "smoothness_score": smoothness_score,
    }


# ── Classify multiple routes ─────────────────────────────────────────────────

def classify_routes(scored_routes: list[dict]) -> list[dict]:
    """
    Given a list of route dicts (each having waypoints, distance_km, duration_min,
    and the score_route outputs), label each as fastest / safest / smoothest.
    Returns them sorted: safest first.
    """
    if not scored_routes:
        return []

    # Find the best in each category
    fastest_idx = min(range(len(scored_routes)), key=lambda i: scored_routes[i]["duration_min"])
    safest_idx  = max(range(len(scored_routes)), key=lambda i: scored_routes[i]["safety_score"])
    smoothest_idx = max(range(len(scored_routes)), key=lambda i: scored_routes[i]["smoothness_score"])

    # Assign labels (a route can have multiple labels)
    for i, route in enumerate(scored_routes):
        labels = []
        if i == safest_idx:
            labels.append("safest")
        if i == fastest_idx:
            labels.append("fastest")
        if i == smoothest_idx:
            labels.append("smoothest")
        if not labels:
            labels.append("alternative")
        route["type"] = labels[0]  # primary label
        route["labels"] = labels
        route["recommended"] = (i == safest_idx)

    # Sort: safest first, then fastest, then rest
    order = {"safest": 0, "fastest": 1, "smoothest": 2, "alternative": 3}
    scored_routes.sort(key=lambda r: order.get(r["type"], 9))
    return scored_routes


# ── Full analysis pipeline ────────────────────────────────────────────────────

def analyze_routes(source: str, destination: str) -> dict:
    """
    End-to-end: geocode → OSRM → score → classify → return.
    """
    src_lat, src_lng = geocode_text(source)
    dst_lat, dst_lng = geocode_text(destination)

    raw_routes = fetch_osrm_routes(src_lat, src_lng, dst_lat, dst_lng)

    # Get all known events for scoring
    all_events = supabase_service.get_events()

    results = []
    for route in raw_routes:
        scores = score_route(route["waypoints"], all_events)
        results.append({
            **route,
            **scores,
        })

    classified = classify_routes(results)

    # Compute potholes_avoided for safest vs fastest
    if len(classified) >= 2:
        max_potholes = max(r["pothole_count"] for r in classified)
        for r in classified:
            r["potholes_avoided"] = max(0, max_potholes - r["pothole_count"])
    else:
        for r in classified:
            r["potholes_avoided"] = 0

    return {
        "source": source,
        "destination": destination,
        "source_coords": [src_lat, src_lng],
        "destination_coords": [dst_lat, dst_lng],
        "routes": classified,
        "total_routes": len(classified),
    }
