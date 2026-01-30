# backend/app/api/v1/ws.py
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.websocket.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/sessions/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str) -> None:
    """WebSocket endpoint for real-time session updates.

    Clients connect with a session_id and receive events for that session.
    Supports ping/pong for keepalive.
    """
    await ws_manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            # Other message types can be handled here in the future
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)
    except Exception as e:
        logger.warning(
            "websocket_error",
            extra={"session_id": session_id, "error": str(e)},
        )
        ws_manager.disconnect(session_id, websocket)
