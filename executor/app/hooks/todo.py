from typing import Any

from claude_agent_sdk import AssistantMessage, ToolUseBlock

from app.hooks.base import AgentHook, ExecutionContext
from app.schemas.enums import TodoStatus
from app.schemas.state import TodoItem


class TodoHook(AgentHook):
    async def on_agent_response(self, context: ExecutionContext, message: Any) -> None:
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ToolUseBlock) and block.name == "TodoWrite":
                    raw_todos = block.input.get("todos", [])
                    if not isinstance(raw_todos, list):
                        return

                    context.current_state.todos = [
                        TodoItem.model_validate(t)
                        for t in raw_todos
                        if isinstance(t, dict)
                    ]

                    active = next(
                        (
                            t
                            for t in context.current_state.todos
                            if t.status == TodoStatus.IN_PROGRESS
                        ),
                        None,
                    )
                    context.current_state.current_step = (
                        (active.active_form or active.content) if active else None
                    )
