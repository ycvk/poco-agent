import logging
import time

from app.services.backend_client import BackendClient
from app.core.settings import get_settings
from app.core.runtime import get_pull_service

logger = logging.getLogger(__name__)


class ScheduledTaskDispatchService:
    """Background service that asks Backend to enqueue due scheduled tasks."""

    def __init__(self, backend_client: BackendClient | None = None) -> None:
        self.settings = get_settings()
        self.backend_client = backend_client or BackendClient()

    async def dispatch_due(self) -> None:
        started = time.perf_counter()
        batch_size = max(1, int(self.settings.scheduled_tasks_dispatch_batch_size))
        try:
            payload = await self.backend_client.dispatch_due_scheduled_tasks(
                limit=batch_size
            )
            dispatched = 0
            if isinstance(payload, dict):
                dispatched = int(payload.get("dispatched", 0))
            if dispatched > 0:
                pull_service = get_pull_service()
                if pull_service is not None:
                    pull_service.trigger_poll(
                        schedule_modes=["scheduled"],
                        reason="dispatch_due_scheduled_tasks",
                    )
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "scheduled_tasks_dispatch",
                extra={
                    "duration_ms": duration_ms,
                    "batch_size": batch_size,
                    "result": payload,
                },
            )
        except Exception as e:
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.error(
                "scheduled_tasks_dispatch_failed",
                extra={
                    "duration_ms": duration_ms,
                    "batch_size": batch_size,
                    "error": str(e),
                },
            )
