import logging
import os
import time

from claude_agent_sdk import ClaudeAgentOptions
from claude_agent_sdk.client import ClaudeSDKClient
from claude_agent_sdk.types import (
    HookContext,
    HookInput,
    HookMatcher,
    PermissionResultAllow,
    PermissionResultDeny,
    SyncHookJSONOutput,
)
from dotenv import load_dotenv

from app.core.workspace import WorkspaceManager
from app.core.user_input import UserInputClient
from app.hooks.base import ExecutionContext
from app.hooks.manager import HookManager
from app.core.observability.request_context import (
    generate_request_id,
    generate_trace_id,
    reset_request_id,
    reset_trace_id,
    set_request_id,
    set_trace_id,
)
from app.schemas.request import TaskConfig

load_dotenv()

logger = logging.getLogger(__name__)


class AgentExecutor:
    def __init__(
        self,
        session_id: str,
        hooks: list,
        sdk_session_id: str | None = None,
        user_input_client: UserInputClient | None = None,
        *,
        request_id: str | None = None,
        trace_id: str | None = None,
    ):
        self.session_id = session_id
        self.sdk_session_id = sdk_session_id
        self.hooks = HookManager(hooks)
        self.user_input_client = user_input_client
        self._request_id = request_id
        self._trace_id = trace_id
        self.workspace = WorkspaceManager(
            mount_path=os.environ.get("WORKSPACE_PATH", "/workspace")
        )

    async def execute(self, prompt: str, config: TaskConfig):
        await self.workspace.prepare(config)
        ctx = ExecutionContext(self.session_id, str(self.workspace.work_path))

        request_id_token = set_request_id(self._request_id or generate_request_id())
        trace_id_token = set_trace_id(self._trace_id or generate_trace_id())

        started = time.perf_counter()
        status = "completed"
        logger.info(
            "task_started",
            extra={
                "session_id": self.session_id,
                "sdk_session_id": self.sdk_session_id,
            },
        )

        try:
            await self.hooks.run_on_setup(ctx)

            input_hint = self._build_input_hint(config)
            if input_hint:
                prompt = f"{input_hint}\n\n{prompt}"

            prompt = f"{prompt}\n\nCurrent working directory: {ctx.cwd}"

            async def dummy_hook(
                input_data: HookInput, tool_use_id: str | None, context: HookContext
            ) -> SyncHookJSONOutput:
                return {"continue_": True}

            async def can_use_tool(tool_name, input_data, context):
                if tool_name != "AskUserQuestion":
                    return PermissionResultAllow(updated_input=input_data)

                if not self.user_input_client:
                    return PermissionResultDeny(
                        message="User input client not configured"
                    )

                try:
                    request_payload = {
                        "session_id": self.session_id,
                        "tool_name": tool_name,
                        "tool_input": input_data,
                    }
                    created = await self.user_input_client.create_request(
                        request_payload
                    )
                    request_id = created.get("id")
                    if not request_id:
                        return PermissionResultDeny(
                            message="Failed to create user input request"
                        )
                    result = await self.user_input_client.wait_for_answer(
                        request_id=request_id,
                        timeout_seconds=60,
                    )
                except Exception:
                    return PermissionResultDeny(message="User input handling failed")

                if not result or result.get("answers") is None:
                    return PermissionResultDeny(message="User input timeout")

                return PermissionResultAllow(
                    updated_input={
                        "questions": input_data.get("questions", []),
                        "answers": result.get("answers", {}),
                    }
                )

            options = ClaudeAgentOptions(
                cwd=ctx.cwd,
                resume=self.sdk_session_id,
                setting_sources=["project"],
                allowed_tools=["Skill", "Read", "Write", "Bash", "TodoWrite"],
                mcp_servers=config.mcp_config,
                permission_mode="default",
                model=os.environ["DEFAULT_MODEL"],
                can_use_tool=can_use_tool,
                hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[dummy_hook])]},
            )

            async with ClaudeSDKClient(options=options) as client:
                await client.query(prompt)
                async for msg in client.receive_response():
                    await self.hooks.run_on_response(ctx, msg)

        except Exception as e:
            status = "failed"
            logger.exception(
                "task_failed",
                extra={
                    "session_id": self.session_id,
                    "sdk_session_id": self.sdk_session_id,
                },
            )
            await self.hooks.run_on_error(ctx, e)

        finally:
            await self.hooks.run_on_teardown(ctx)
            await self.workspace.cleanup()
            logger.info(
                "task_finished",
                extra={
                    "session_id": self.session_id,
                    "sdk_session_id": self.sdk_session_id,
                    "status": status,
                    "duration_ms": int((time.perf_counter() - started) * 1000),
                },
            )
            reset_request_id(request_id_token)
            reset_trace_id(trace_id_token)

    def _build_input_hint(self, config: TaskConfig) -> str | None:
        inputs = config.input_files or []
        if not inputs:
            return None

        lines = [
            "User-uploaded inputs are available under inputs/ (or /workspace/inputs):",
        ]
        for item in inputs:
            path = getattr(item, "path", None) or ""
            name = getattr(item, "name", None) or ""
            display = path.lstrip("/") if path else (f"inputs/{name}" if name else "")
            if display:
                lines.append(f"- {display}")
        lines.append("Do not modify files under inputs/ unless the user asks.")
        return "\n".join(lines)
