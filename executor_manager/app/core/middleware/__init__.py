from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.middleware.request_context import (
    REQUEST_ID_HEADER,
    TRACE_ID_HEADER,
    RequestContextMiddleware,
)
from app.core.middleware.request_logging import RequestLoggingMiddleware
from app.core.settings import get_settings


def setup_middleware(app: FastAPI) -> None:
    """Setup middleware (request context/logging + CORS)."""
    settings = get_settings()

    # Inner -> outer: add order matters (Starlette wraps last-added as the outermost).
    app.add_middleware(RequestLoggingMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER, TRACE_ID_HEADER],
    )

    # Outermost: ensure request_id/trace_id exist for all downstream logs.
    app.add_middleware(RequestContextMiddleware)
