from fastapi import APIRouter, BackgroundTasks

from app.core.callback import CallbackClient
from app.core.user_input import UserInputClient
from app.core.engine import AgentExecutor
from app.hooks.callback import CallbackHook
from app.hooks.workspace import WorkspaceHook
from app.schemas.request import TaskRun

router = APIRouter(prefix="/v1/tasks")


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
        CallbackHook(client=callback_client),
    ]
    executor = AgentExecutor(
        req.session_id,
        hooks,
        req.sdk_session_id,
        user_input_client=user_input_client,
    )

    background_tasks.add_task(executor.execute, prompt=req.prompt, config=req.config)

    return {"status": "accepted", "session_id": req.session_id}
