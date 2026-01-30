from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class PullTriggerRequest(BaseModel):
    schedule_modes: list[str] | None = Field(default=None)
    reason: str | None = Field(default=None)

    @field_validator("schedule_modes")
    @classmethod
    def _normalize_schedule_modes(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = [m.strip() for m in v if isinstance(m, str) and m.strip()]
        return cleaned or None


class PullTriggerResponse(BaseModel):
    accepted: bool
    schedule_modes: list[str]
    reason: str | None = None

