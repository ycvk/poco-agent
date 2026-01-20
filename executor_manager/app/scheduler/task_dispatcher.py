import logging

from app.core.settings import get_settings
from app.core.observability.request_context import (
    generate_request_id,
    generate_trace_id,
    get_request_id,
    get_trace_id,
    reset_request_id,
    reset_trace_id,
    set_request_id,
    set_trace_id,
)
from app.services.backend_client import BackendClient
from app.services.container_pool import ContainerPool
from app.services.executor_client import ExecutorClient
from app.services.config_resolver import ConfigResolver
from app.services.skill_stager import SkillStager
from app.services.attachment_stager import AttachmentStager

logger = logging.getLogger(__name__)


class TaskDispatcher:
    """Task dispatcher with container pool integration."""

    container_pool: ContainerPool | None = None

    @classmethod
    def get_container_pool(cls) -> ContainerPool:
        """Get container pool instance (lazy load)."""
        if cls.container_pool is None:
            cls.container_pool = ContainerPool()
        return cls.container_pool

    @staticmethod
    async def dispatch(
        task_id: str,
        session_id: str,
        prompt: str,
        config: dict,
        sdk_session_id: str | None = None,
    ) -> None:
        """Dispatch task to executor.

        Args:
            task_id: Task ID
            session_id: Session ID
            prompt: Task prompt
            config: Task configuration
            sdk_session_id: Claude SDK session ID for resuming conversations
        """
        settings = get_settings()
        executor_client = ExecutorClient()
        backend_client = BackendClient()
        container_pool = TaskDispatcher.get_container_pool()
        config_resolver = ConfigResolver(backend_client)
        skill_stager = SkillStager()
        attachment_stager = AttachmentStager()

        user_id = config.get("user_id", "")
        container_mode = config.get("container_mode", "ephemeral")
        container_id = config.get("container_id")

        callback_url = f"{settings.callback_base_url}/api/v1/callback"
        callback_token = settings.callback_token

        executor_url = None
        request_id_token = set_request_id(get_request_id() or generate_request_id())
        trace_id_token = set_trace_id(get_trace_id() or generate_trace_id())
        try:
            logger.info(
                f"Dispatching task {task_id} (session: {session_id}, mode: {container_mode})"
            )

            resolved_config = await config_resolver.resolve(user_id, config or {})
            staged_skills = skill_stager.stage_skills(
                user_id=user_id,
                session_id=session_id,
                skills=resolved_config.get("skill_files") or {},
            )
            resolved_config["skill_files"] = staged_skills
            staged_inputs = attachment_stager.stage_inputs(
                user_id=user_id,
                session_id=session_id,
                inputs=resolved_config.get("input_files") or [],
            )
            resolved_config["input_files"] = staged_inputs

            executor_url, container_id = await container_pool.get_or_create_container(
                session_id=session_id,
                user_id=user_id,
                container_mode=container_mode,
                container_id=container_id,
            )

            await backend_client.update_session_status(session_id, "running")

            await executor_client.execute_task(
                executor_url=executor_url,
                session_id=session_id,
                prompt=prompt,
                callback_url=callback_url,
                callback_token=callback_token,
                config=resolved_config,
                callback_base_url=settings.callback_base_url,
                sdk_session_id=sdk_session_id,
            )

            logger.info(f"Task {task_id} dispatched successfully to executor")

        except Exception as e:
            logger.error(f"Failed to dispatch task {task_id}: {e}")
            await backend_client.update_session_status(session_id, "failed")
            await container_pool.cancel_task(session_id)
            raise
        finally:
            reset_request_id(request_id_token)
            reset_trace_id(trace_id_token)

    @staticmethod
    async def on_task_complete(session_id: str) -> None:
        """Handle task completion.

        Args:
            session_id: Session ID
        """
        container_pool = TaskDispatcher.get_container_pool()
        await container_pool.on_task_complete(session_id)
