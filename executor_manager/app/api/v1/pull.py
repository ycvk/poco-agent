from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.core.runtime import get_pull_service
from app.core.settings import get_settings
from app.schemas.pull import PullTriggerRequest, PullTriggerResponse
from app.schemas.response import Response, ResponseSchema

router = APIRouter(prefix="/internal/pull", tags=["internal"])


def require_internal_token(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    settings = get_settings()
    if not settings.internal_api_token:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Internal API token is not configured",
        )
    if not x_internal_token or x_internal_token != settings.internal_api_token:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Invalid internal token",
        )


@router.post(
    "/trigger",
    response_model=ResponseSchema[PullTriggerResponse],
)
async def trigger_pull(
    request: PullTriggerRequest,
    _: None = Depends(require_internal_token),
) -> JSONResponse:
    """Trigger a best-effort run queue pull.

    This endpoint exists to reduce empty polling and improve latency for immediate tasks:
    - Backend can call it after enqueueing a new immediate run.
    - Executor Manager can also call pull internally on task completion.
    """
    pull_service = get_pull_service()
    if pull_service is None:
        return Response.success(
            data=PullTriggerResponse(
                accepted=False,
                schedule_modes=request.schedule_modes or [],
                reason="task_pull_disabled",
            ).model_dump(mode="json"),
            message="Run pull service is disabled",
        )

    requested_modes = request.schedule_modes or ["immediate"]
    active_modes = set(pull_service.get_active_schedule_modes())
    effective_modes = [m for m in requested_modes if m in active_modes]

    if not effective_modes:
        return Response.success(
            data=PullTriggerResponse(
                accepted=False,
                schedule_modes=requested_modes,
                reason="no_active_modes",
            ).model_dump(mode="json"),
            message="No active schedule modes to poll",
        )

    accepted = pull_service.trigger_poll(
        schedule_modes=effective_modes,
        reason=request.reason,
    )
    return Response.success(
        data=PullTriggerResponse(
            accepted=accepted,
            schedule_modes=effective_modes,
            reason=request.reason,
        ).model_dump(mode="json"),
        message="Pull triggered" if accepted else "Pull skipped",
    )

