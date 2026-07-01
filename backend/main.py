from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from services import supabase_service
from services.websocket_service import socket_manager
from routes import events, ml, agent, analytics, route_logs, reports

app = FastAPI(title="UrbanGuard Smart Road Intelligence API")

# Update CORS to allow * for ngrok/phone testing, along with local dev hosts
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "*", # Allow all for external devices/ngrok
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket endpoint for real-time telemetry streaming
@app.websocket("/ws/events")
async def events_websocket(websocket: WebSocket):
    await socket_manager.connect(websocket)

    # Send initial database snapshot to the client on connection
    events_snapshot = supabase_service.get_events()
    await websocket.send_json({
        "type": "snapshot",
        "events": events_snapshot,
    })

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket)
    except Exception:
        socket_manager.disconnect(websocket)

# Include Sub-Routers
app.include_router(events.router)
app.include_router(ml.router)
app.include_router(agent.router)
app.include_router(analytics.router)
app.include_router(route_logs.router)
app.include_router(reports.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)