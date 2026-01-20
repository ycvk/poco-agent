from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.observability.request_context import (
    generate_request_id,
    generate_trace_id,
    get_trace_id,
    reset_request_id,
    reset_trace_id,
    set_request_id,
    set_trace_id,
)

REQUEST_ID_HEADER = "X-Request-ID"
TRACE_ID_HEADER = "X-Trace-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER) or generate_request_id()
        trace_id = (
            request.headers.get(TRACE_ID_HEADER)
            or get_trace_id()
            or generate_trace_id()
        )

        request_id_token = set_request_id(request_id)
        trace_id_token = set_trace_id(trace_id)

        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id
            response.headers[TRACE_ID_HEADER] = trace_id
            return response
        finally:
            reset_request_id(request_id_token)
            reset_trace_id(trace_id_token)
