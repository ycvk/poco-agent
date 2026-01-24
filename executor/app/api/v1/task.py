import logging

from fastapi import APIRouter, BackgroundTasks

from app.core.callback import CallbackClient
from app.core.user_input import UserInputClient
from app.core.engine import AgentExecutor
from app.hooks.callback import CallbackHook
from app.hooks.todo import TodoHook
from app.hooks.workspace import WorkspaceHook
from app.core.observability.request_context import get_request_id, get_trace_id
from app.schemas.request import TaskRun

router = APIRouter(prefix="/v1/tasks")
logger = logging.getLogger(__name__)


@router.post("/execute")
async def run_task(req: TaskRun, background_tasks: BackgroundTasks) -> dict:
    """Execute an agent task in the background.

    Args:
        req: Task execution request containing prompt, config, and callback URL.
        background_tasks: FastAPI background tasks manager.

    Returns:
        Accepted status with session ID.
    """
    callback_client = CallbackClient(callback_url=req.callback_url)
    base_url = UserInputClient.resolve_base_url(
        callback_url=req.callback_url, callback_base_url=req.callback_base_url
    )
    user_input_client = UserInputClient(base_url=base_url)
    hooks = [
        WorkspaceHook(),
        TodoHook(),
        CallbackHook(client=callback_client),
    ]
    executor = AgentExecutor(
        req.session_id,
        hooks,
        req.sdk_session_id,
        user_input_client=user_input_client,
        request_id=get_request_id(),
        trace_id=get_trace_id(),
    )

    cfg = req.config
    logger.info(
        "task_execute_accepted",
        extra={
            "session_id": req.session_id,
            "resume": bool(req.sdk_session_id),
            "git_branch": cfg.git_branch,
            "has_repo_url": bool((cfg.repo_url or "").strip()),
            "mcp_server_count": len(cfg.mcp_config or {}),
            "skill_count": len(cfg.skill_files or {}),
            "input_count": len(cfg.input_files or []),
        },
    )

    background_tasks.add_task(executor.execute, prompt=req.prompt, config=req.config)

    return {"status": "accepted", "session_id": req.session_id}
