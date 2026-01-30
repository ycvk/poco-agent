# backend/app/core/websocket/events.py
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """WebSocket event types."""

    SESSION_SNAPSHOT = "session.snapshot"
    SESSION_STATUS = "session.status"
    SESSION_PROGRESS = "session.progress"
    SESSION_PATCH = "session.patch"
    TODO_UPDATE = "todo.update"
    USER_INPUT_UPDATE = "user_input.update"
    MESSAGE_NEW = "message.new"
    MESSAGE_CHUNK = "message.chunk"
    TOOL_CALL = "tool.call"
    WORKSPACE_EXPORT = "workspace.export"
    WORKSPACE_FILES = "workspace.files"
    WORKSPACE_FILE_URL = "workspace.file.url"
    SKILL_IMPORT_JOB = "skill_import.job"


class WSEvent(BaseModel):
    """WebSocket event payload."""

    type: EventType
    session_id: str
    data: dict[str, Any]
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type.value,
            "session_id": self.session_id,
            "data": self.data,
            "timestamp": self.timestamp,
        }
