# backend/app/api/v1/ws.py
import logging
import uuid as uuid_module

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.deps import DEFAULT_USER_ID
from app.core.database import SessionLocal
from app.core.websocket.manager import ws_manager
from app.models.agent_session import AgentSession
from app.repositories.session_repository import SessionRepository
from app.services.websocket_service import websocket_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


def _extract_ws_user_id(websocket: WebSocket) -> tuple[str, str | None]:
    """Extract user_id from a WebSocket handshake.

    NOTE:
    - Browsers cannot set arbitrary headers, so we allow a query param fallback.
    - If both are present, they must match.
    """
    header_user_id = (websocket.headers.get("x-user-id") or "").strip()
    query_user_id = (websocket.query_params.get("user_id") or "").strip()

    if header_user_id and query_user_id and header_user_id != query_user_id:
        return DEFAULT_USER_ID, "user_id_mismatch"

    user_id = header_user_id or query_user_id or DEFAULT_USER_ID
    return user_id, None


def _resolve_session(db: Session, session_id: str) -> AgentSession | None:
    """Resolve session by DB uuid or SDK session id."""
    try:
        session_uuid = uuid_module.UUID(session_id)
        return SessionRepository.get_by_id(db, session_uuid)
    except ValueError:
        return SessionRepository.get_by_sdk_session_id(db, session_id)


@router.websocket("/ws/sessions/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str) -> None:
    """WebSocket endpoint for real-time session updates.

    Clients connect with a session_id and receive events for that session.
    Supports ping/pong for keepalive.
    """
    user_id, user_err = _extract_ws_user_id(websocket)
    if user_err:
        logger.warning(
            "websocket_rejected",
            extra={
                "reason": user_err,
                "session_id": session_id,
                "header_user_id": websocket.headers.get("x-user-id"),
                "query_user_id": websocket.query_params.get("user_id"),
            },
        )
        await websocket.close(code=1008)
        return

    ws_key = session_id
    db = SessionLocal()
    try:
        db_session = _resolve_session(db, session_id)
        if db_session:
            ws_key = str(db_session.id)
            if db_session.user_id != user_id:
                logger.warning(
                    "websocket_rejected",
                    extra={
                        "reason": "session_not_owned_by_user",
                        "session_id": session_id,
                        "ws_key": ws_key,
                        "user_id": user_id,
                        "owner_user_id": db_session.user_id,
                    },
                )
                await websocket.close(code=1008)
                return
    finally:
        db.close()

    await ws_manager.connect(ws_key, websocket)
    await websocket_service.send_session_snapshot(websocket, session_id=session_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            if msg_type == "session.snapshot.request":
                await websocket_service.send_session_snapshot(
                    websocket,
                    session_id=session_id,
                )
            if msg_type == "workspace.files.request":
                await websocket_service.send_workspace_files(websocket, session_id=session_id)
            if msg_type == "workspace.file.url.request":
                path = data.get("path")
                if isinstance(path, str) and path.strip():
                    await websocket_service.send_workspace_file_url(
                        websocket,
                        session_id=session_id,
                        path=path,
                    )
            # Other message types can be handled here in the future
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws_key, websocket)
    except Exception as e:
        logger.warning(
            "websocket_error",
            extra={"session_id": session_id, "ws_key": ws_key, "error": str(e)},
        )
        await ws_manager.disconnect(ws_key, websocket)


@router.websocket("/ws/user")
async def user_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for user-level updates (e.g., skill import jobs)."""
    user_id, user_err = _extract_ws_user_id(websocket)
    if user_err:
        logger.warning(
            "websocket_user_rejected",
            extra={
                "reason": user_err,
                "header_user_id": websocket.headers.get("x-user-id"),
                "query_user_id": websocket.query_params.get("user_id"),
            },
        )
        await websocket.close(code=1008)
        return
    key = f"user:{user_id}"
    await ws_manager.connect(key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            if msg_type == "skill_import.job.request":
                job_id = data.get("job_id")
                if isinstance(job_id, str) and job_id.strip():
                    await websocket_service.send_skill_import_job(
                        websocket,
                        job_id=job_id,
                        user_id=user_id,
                    )
    except WebSocketDisconnect:
        await ws_manager.disconnect(key, websocket)
    except Exception as e:
        logger.warning(
            "websocket_user_error",
            extra={"user_id": user_id, "error": str(e)},
        )
        await ws_manager.disconnect(key, websocket)
