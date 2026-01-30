# backend/app/core/websocket/manager.py
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections grouped by session_id."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        """Accept and register a WebSocket connection for a session."""
        await websocket.accept()
        if session_id not in self._connections:
            self._connections[session_id] = set()
        self._connections[session_id].add(websocket)
        logger.info(
            "websocket_connected",
            extra={
                "session_id": session_id,
                "connection_count": len(self._connections[session_id]),
            },
        )

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from a session."""
        if session_id in self._connections:
            self._connections[session_id].discard(websocket)
            remaining = len(self._connections[session_id])
            if remaining == 0:
                del self._connections[session_id]
            logger.info(
                "websocket_disconnected",
                extra={"session_id": session_id, "remaining_connections": remaining},
            )

    def get_connection_count(self, session_id: str) -> int:
        """Get the number of active connections for a session."""
        return len(self._connections.get(session_id, set()))

    def has_connections(self, session_id: str) -> bool:
        """Check if a session has any active connections."""
        return session_id in self._connections and len(self._connections[session_id]) > 0

    async def broadcast(self, session_id: str, event: dict[str, Any]) -> int:
        """Broadcast an event to all connections for a session.

        Returns the number of successful sends.
        """
        connections = self._connections.get(session_id, set())
        if not connections:
            return 0

        dead: list[WebSocket] = []
        sent = 0

        for ws in connections:
            try:
                await ws.send_json(event)
                sent += 1
            except Exception as e:
                logger.warning(
                    "websocket_send_failed",
                    extra={"session_id": session_id, "error": str(e)},
                )
                dead.append(ws)

        for ws in dead:
            self.disconnect(session_id, ws)

        return sent


# Global singleton instance
ws_manager = ConnectionManager()
