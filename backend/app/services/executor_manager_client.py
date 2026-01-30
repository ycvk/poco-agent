import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.observability.request_context import get_request_id, get_trace_id
from app.core.settings import get_settings

logger = logging.getLogger(__name__)


def trigger_run_pull(
    *,
    schedule_modes: list[str] | None = None,
    reason: str | None = None,
    timeout_seconds: float = 2.0,
) -> bool:
    """Best-effort trigger for Executor Manager to pull the run queue.

    This is intended to reduce empty polling on the manager side while keeping low-latency
    dispatch for immediate runs.

    Returns:
        True if the manager accepted the trigger; False otherwise.
    """
    settings = get_settings()
    if not settings.internal_api_token:
        logger.warning("executor_manager_trigger_skipped: missing INTERNAL_API_TOKEN")
        return False

    base_url = (settings.executor_manager_url or "").rstrip("/")
    if not base_url:
        logger.warning("executor_manager_trigger_skipped: missing EXECUTOR_MANAGER_URL")
        return False

    url = f"{base_url}/api/v1/internal/pull/trigger"

    cleaned_modes = [
        m.strip()
        for m in (schedule_modes or [])
        if isinstance(m, str) and m.strip()
    ]
    payload = {"schedule_modes": cleaned_modes, "reason": reason}

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "X-Internal-Token": settings.internal_api_token,
    }
    request_id = get_request_id()
    if request_id:
        headers["X-Request-ID"] = request_id
    trace_id = get_trace_id()
    if trace_id:
        headers["X-Trace-ID"] = trace_id

    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=max(0.5, float(timeout_seconds))) as resp:  # noqa: S310
            raw = resp.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        data = parsed.get("data", parsed) if isinstance(parsed, dict) else {}
        if isinstance(data, dict):
            return bool(data.get("accepted", False))
        return False
    except HTTPError as e:
        logger.warning(
            "executor_manager_trigger_failed",
            extra={"status_code": e.code, "reason": reason, "url": url},
        )
        return False
    except URLError as e:
        logger.warning(
            "executor_manager_trigger_unavailable",
            extra={"error": str(getattr(e, "reason", e)), "reason": reason, "url": url},
        )
        return False
    except Exception as e:
        logger.warning(
            "executor_manager_trigger_error",
            extra={"error": str(e), "reason": reason, "url": url},
        )
        return False
