from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.models.agent_message import AgentMessage
from app.models.agent_session import AgentSession
from app.models.tool_execution import ToolExecution
from app.models.usage_log import UsageLog


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


class TimestampMixin:
    """Mixin to add timestamp fields to models."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


__all__ = [
    "Base",
    "TimestampMixin",
    "AgentSession",
    "AgentMessage",
    "ToolExecution",
    "UsageLog",
]
