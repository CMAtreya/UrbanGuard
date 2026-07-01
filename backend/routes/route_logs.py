"""
Route analysis + logging endpoints.
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.route_service import analyze_routes

router = APIRouter()

# ── In-memory route log store ─────────────────────────────────────────────────
_route_logs: list[dict] = []
_log_id_counter = 0


class RouteAnalyzeRequest(BaseModel):
    source: str
    destination: str


# ── Analyze routes ────────────────────────────────────────────────────────────

@router.post("/api/routes/analyze")
def post_analyze_routes(body: RouteAnalyzeRequest):
    """
    Geocode source + destination, fetch OSRM alternatives,
    score each route against known anomalies, and return ranked results.
    """
    global _log_id_counter

    if not body.source.strip() or not body.destination.strip():
        raise HTTPException(status_code=400, detail="source and destination are required")

    try:
        result = analyze_routes(body.source.strip(), body.destination.strip())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route analysis failed: {e}")

    # Auto-save to route log
    _log_id_counter += 1
    safest = next((r for r in result.get("routes", []) if r.get("type") == "safest"), None)
    log_entry = {
        "id": _log_id_counter,
        "source": body.source.strip(),
        "destination": body.destination.strip(),
        "timestamp": datetime.utcnow().isoformat(),
        "total_routes": result.get("total_routes", 0),
        "safest_score": safest["safety_score"] if safest else None,
        "safest_distance_km": safest["distance_km"] if safest else None,
        "potholes_avoided": safest["potholes_avoided"] if safest else 0,
    }
    _route_logs.append(log_entry)
    # Keep only last 50
    if len(_route_logs) > 50:
        _route_logs.pop(0)

    return result


# ── Route log history ─────────────────────────────────────────────────────────

@router.get("/api/route-logs")
def get_route_logs():
    """Return saved route analysis history, newest first."""
    return {"logs": list(reversed(_route_logs)), "count": len(_route_logs)}


@router.delete("/api/route-logs/{log_id}")
def delete_route_log(log_id: int):
    global _route_logs
    initial = len(_route_logs)
    _route_logs = [entry for entry in _route_logs if entry.get("id") != log_id]
    if len(_route_logs) == initial:
        raise HTTPException(status_code=404, detail=f"Route log {log_id} not found")
    return {"message": "Route log deleted"}
