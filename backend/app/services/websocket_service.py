# backend/app/services/websocket_service.py
import logging

from app.core.websocket.events import EventType, WSEvent
from app.core.websocket.manager import ws_manager
from app.models.agent_message import AgentMessage
from app.schemas.callback import AgentCallbackRequest

logger = logging.getLogger(__name__)


class WebSocketService:
    """Service for broadcasting events to WebSocket clients."""

    async def broadcast_callback(
        self,
        callback: AgentCallbackRequest,
        db_message: AgentMessage | None = None,
    ) -> None:
        """Broadcast callback data as WebSocket events."""
        session_id = callback.session_id

        if not ws_manager.has_connections(session_id):
            return

        # Status/progress event
        status_event = WSEvent(
            type=EventType.SESSION_STATUS,
            session_id=session_id,
            data={
                "status": callback.status.value if hasattr(callback.status, "value") else str(callback.status),
                "progress": callback.progress or 0,
                "current_step": callback.state_patch.current_step if callback.state_patch else None,
            },
        )
        sent = await ws_manager.broadcast(session_id, status_event.to_dict())
        logger.debug(
            "ws_status_broadcast",
            extra={"session_id": session_id, "sent_count": sent},
        )

        # Todo update event
        if callback.state_patch and callback.state_patch.todos:
            todo_event = WSEvent(
                type=EventType.TODO_UPDATE,
                session_id=session_id,
                data={
                    "todos": [t.model_dump(mode="json") for t in callback.state_patch.todos],
                },
            )
            await ws_manager.broadcast(session_id, todo_event.to_dict())

        # New message event - push full message content
        if db_message:
            message_event = WSEvent(
                type=EventType.MESSAGE_NEW,
                session_id=session_id,
                data={
                    "id": db_message.id,
                    "role": db_message.role,
                    "content": db_message.content,
                    "timestamp": db_message.created_at.isoformat() if db_message.created_at else None,
                    "text_preview": db_message.text_preview,
                },
            )
            await ws_manager.broadcast(session_id, message_event.to_dict())
            logger.debug(
                "ws_message_broadcast",
                extra={"session_id": session_id, "message_id": db_message.id},
            )


websocket_service = WebSocketService()
