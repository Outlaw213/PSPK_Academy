"""Uniform error format (NFR-01): {"error": {"code", "message", "details"}}.

Codes are stable English identifiers (Q-31); the catalogue lives in docs/api.md.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app.errors")

_HTTP_CODES = {
    401: ("UNAUTHENTICATED", "Authentication required."),
    403: ("FORBIDDEN", "You do not have access to this resource."),
    404: ("NOT_FOUND", "Not found."),
    405: ("METHOD_NOT_ALLOWED", "Method not allowed."),
}


class AppError(Exception):
    """A business or request error with a stable code from the API catalogue."""

    def __init__(self, code: str, message: str, status_code: int, details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def error_response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code, content={"error": {"code": code, "message": message, "details": details}}
    )


async def _app_error(_: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details)


async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code, message = _HTTP_CODES.get(exc.status_code, ("HTTP_ERROR", "Request failed."))
    return error_response(exc.status_code, code, message)


async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Only location, message and type: never echo submitted values (they may contain passwords, NFR-02).
    details = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return error_response(422, "VALIDATION_ERROR", "Request validation failed.", details)


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.error("Unhandled error on %s %s: %s", request.method, request.url.path, type(exc).__name__)
    return error_response(500, "INTERNAL_ERROR", "Internal server error.")


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _http_error)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unhandled)
