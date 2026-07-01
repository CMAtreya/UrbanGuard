from fastapi import APIRouter, HTTPException
from services import agent_service

router = APIRouter()

@router.get("/api/agent/road-summary")
async def get_road_summary(lat: float, lng: float):
    try:
        summary_data = await agent_service.get_road_summary(lat, lng)
        return summary_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Agent error: {str(e)}")
