# backend/app/core/websocket/manager.py
import asyncio
import logging
from typing import Any
from collections.abc import Coroutine

from fastapi import WebSocket

logger = logging.getLogger(__name__)

_ws_loop: asyncio.AbstractEventLoop | None = None


def set_ws_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Register the main event loop used for WebSocket operations."""
    global _ws_loop
    _ws_loop = loop


def schedule_ws(coro: Coroutine[Any, Any, Any]) -> None:
    """Schedule a coroutine on the main WebSocket loop (best-effort).

    This is used to safely broadcast from non-async/background contexts.
    """
    loop = _ws_loop
    if loop is not None and loop.is_running():
        asyncio.run_coroutine_threadsafe(coro, loop)
        return

    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("ws_loop_not_set; dropping websocket task")
        return
    running.create_task(coro)


class ConnectionManager:
    """Manages WebSocket connections grouped by key."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock: asyncio.Lock | None = None

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def connect(self, key: str, websocket: WebSocket) -> None:
        """Accept and register a WebSocket connection for a key."""
        await websocket.accept()
        async with self._get_lock():
            if key not in self._connections:
                self._connections[key] = set()
            self._connections[key].add(websocket)
            connection_count = len(self._connections[key])
        logger.info(
            "websocket_connected",
            extra={
                "key": key,
                "connection_count": connection_count,
            },
        )

    async def disconnect(self, key: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from a key."""
        remaining = None
        async with self._get_lock():
            if key in self._connections:
                self._connections[key].discard(websocket)
                remaining = len(self._connections[key])
                if remaining == 0:
                    del self._connections[key]
        if remaining is not None:
            logger.info(
                "websocket_disconnected",
                extra={"key": key, "remaining_connections": remaining},
            )

    async def get_connection_count(self, key: str) -> int:
        """Get the number of active connections for a key."""
        async with self._get_lock():
            return len(self._connections.get(key, set()))

    async def has_connections(self, key: str) -> bool:
        """Check if a key has any active connections."""
        async with self._get_lock():
            return key in self._connections and len(self._connections[key]) > 0

    async def broadcast(self, key: str, event: dict[str, Any]) -> int:
        """Broadcast an event to all connections for a key.

        Returns the number of successful sends.
        """
        async with self._get_lock():
            connections = list(self._connections.get(key, set()))
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
                    extra={"key": key, "error": str(e)},
                )
                dead.append(ws)

        for ws in dead:
            await self.disconnect(key, ws)

        return sent


# Global singleton instance
ws_manager = ConnectionManager()
