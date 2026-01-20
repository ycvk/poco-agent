import uuid
from contextvars import ContextVar, Token

_request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
_trace_id_ctx: ContextVar[str | None] = ContextVar("trace_id", default=None)


def generate_request_id() -> str:
    return uuid.uuid4().hex


def generate_trace_id() -> str:
    return uuid.uuid4().hex


def set_request_id(value: str | None) -> Token[str | None]:
    return _request_id_ctx.set(value)


def set_trace_id(value: str | None) -> Token[str | None]:
    return _trace_id_ctx.set(value)


def reset_request_id(token: Token[str | None]) -> None:
    _request_id_ctx.reset(token)


def reset_trace_id(token: Token[str | None]) -> None:
    _trace_id_ctx.reset(token)


def get_request_id() -> str | None:
    return _request_id_ctx.get()


def get_trace_id() -> str | None:
    return _trace_id_ctx.get()
