"""
Request ID middleware for end-to-end request tracing.

Injects a unique UUID into every incoming request so that all log lines
for the same request can be correlated.  The same ID is echoed back to the
client in the ``X-Request-ID`` response header.
"""

import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Starlette middleware that attaches a unique request ID to each request.

    The ID is:
    - Stored on ``request.state.request_id`` for use in route handlers and logs.
    - Added to the response as the ``X-Request-ID`` header for client-side tracing.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        return response
