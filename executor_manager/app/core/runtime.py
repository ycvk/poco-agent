from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.run_pull_service import RunPullService


_pull_service: "RunPullService | None" = None


def set_pull_service(service: "RunPullService | None") -> None:
    global _pull_service
    _pull_service = service


def get_pull_service() -> "RunPullService | None":
    return _pull_service

