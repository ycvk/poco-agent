import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user_id, get_db
from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.schemas.message import MessageResponse
from app.schemas.response import Response, ResponseSchema
from app.schemas.session import (
    SessionCreateRequest,
    SessionResponse,
    SessionStateResponse,
    SessionWithTitleResponse,
    SessionUpdateRequest,
)
from app.schemas.tool_execution import ToolExecutionResponse
from app.schemas.usage import UsageResponse
from app.schemas.workspace import FileNode
from app.services.message_service import MessageService
from app.services.session_service import SessionService
from app.services.storage_service import S3StorageService
from app.services.tool_execution_service import ToolExecutionService
from app.services.usage_service import UsageService
from app.utils.workspace import build_workspace_file_nodes
from app.utils.workspace_manifest import (
    build_nodes_from_manifest,
    extract_manifest_files,
    normalize_manifest_path,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

session_service = SessionService()
message_service = MessageService()
tool_execution_service = ToolExecutionService()
usage_service = UsageService()
storage_service = S3StorageService()


@router.post("", response_model=ResponseSchema[SessionResponse])
async def create_session(
    request: SessionCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Creates a new session."""
    db_session = session_service.create_session(db, user_id, request)
    return Response.success(
        data=SessionResponse.model_validate(db_session),
        message="Session created successfully",
    )


@router.get("", response_model=ResponseSchema[list[SessionResponse]])
async def list_sessions(
    user_id: str = Depends(get_current_user_id),
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Lists sessions."""
    sessions = session_service.list_sessions(db, user_id, limit, offset)
    return Response.success(
        data=[SessionResponse.model_validate(s) for s in sessions],
        message="Sessions retrieved successfully",
    )


@router.get(
    "/list-with-titles",
    response_model=ResponseSchema[list[SessionWithTitleResponse]],
    deprecated=True,
)
async def list_sessions_with_titles(
    user_id: str = Depends(get_current_user_id),
    limit: int | None = Query(
        default=None, description="Limit number of results (default: all)"
    ),
    offset: int = Query(default=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Lists sessions with titles from first user prompt.

    @deprecated: Temporary API for frontend development. Will be replaced.
    """
    sessions_with_titles = session_service.list_sessions_with_titles(
        db, user_id, limit, offset
    )

    result = []
    for item in sessions_with_titles:
        session_dict = SessionWithTitleResponse.model_validate(
            item["session"]
        ).model_dump()
        session_dict["title"] = item["title"]
        result.append(SessionWithTitleResponse(**session_dict))

    return Response.success(
        data=result,
        message="Sessions with titles retrieved successfully",
    )


@router.get("/{session_id}", response_model=ResponseSchema[SessionResponse])
async def get_session(
    session_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Gets session details."""
    db_session = session_service.get_session(db, session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )
    return Response.success(
        data=SessionResponse.model_validate(db_session),
        message="Session retrieved successfully",
    )


@router.get("/{session_id}/state", response_model=ResponseSchema[SessionStateResponse])
async def get_session_state(
    session_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Gets session state details."""
    db_session = session_service.get_session(db, session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )
    return Response.success(
        data=SessionStateResponse.model_validate(db_session),
        message="Session state retrieved successfully",
    )


@router.patch("/{session_id}", response_model=ResponseSchema[SessionResponse])
async def update_session(
    session_id: uuid.UUID,
    request: SessionUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Updates a session."""
    db_session = session_service.get_session(db, session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )
    db_session = session_service.update_session(db, session_id, request)
    return Response.success(
        data=SessionResponse.model_validate(db_session),
        message="Session updated successfully",
    )


@router.get(
    "/{session_id}/messages", response_model=ResponseSchema[list[MessageResponse]]
)
async def get_session_messages(
    session_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Gets all messages for a session."""
    # Verify session exists
    db_session = session_service.get_session(db, session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )
    messages = message_service.get_messages(db, session_id)
    return Response.success(
        data=[MessageResponse.model_validate(m) for m in messages],
        message="Messages retrieved successfully",
    )


@router.get(
    "/{session_id}/tool-executions",
    response_model=ResponseSchema[list[ToolExecutionResponse]],
)
async def get_session_tool_executions(
    session_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Gets all tool executions for a session."""
    # Verify session exists
    db_session = session_service.get_session(db, session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )
    executions = tool_execution_service.get_tool_executions(db, session_id)
    return Response.success(
        data=[ToolExecutionResponse.model_validate(e) for e in executions],
        message="Tool executions retrieved successfully",
    )


@router.get("/{session_id}/usage", response_model=ResponseSchema[UsageResponse])
async def get_session_usage(
    session_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Gets usage statistics for a session."""
    # Verify session exists
    db_session = session_service.get_session(db, session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )
    usage = usage_service.get_usage_summary(db, session_id)
    return Response.success(
        data=usage,
        message="Usage statistics retrieved successfully",
    )


@router.get(
    "/{session_id}/workspace/files",
    response_model=ResponseSchema[list[FileNode]],
)
async def get_session_workspace_files(
    session_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """List workspace files for a session (served via OSS manifest)."""
    db_session = session_service.get_session(db, session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )
    if not db_session.workspace_manifest_key:
        return Response.success(data=[], message="Workspace export not ready")

    manifest = storage_service.get_manifest(db_session.workspace_manifest_key)
    raw_nodes = build_nodes_from_manifest(manifest)
    manifest_files = extract_manifest_files(manifest)
    prefix = (db_session.workspace_files_prefix or "").rstrip("/")
    file_url_map: dict[str, str] = {}

    for file_entry in manifest_files:
        file_path = normalize_manifest_path(file_entry.get("path"))
        if not file_path:
            continue
        object_key = (
            file_entry.get("key")
            or file_entry.get("object_key")
            or file_entry.get("oss_key")
            or file_entry.get("s3_key")
        )
        if not object_key and prefix:
            object_key = f"{prefix}/{file_path.lstrip('/')}"
        if not object_key:
            continue
        mime_type = file_entry.get("mimeType") or file_entry.get("mime_type")
        file_url_map[file_path] = storage_service.presign_get(
            object_key,
            response_content_disposition="inline",
            response_content_type=mime_type,
        )

    def build_file_url(file_path: str) -> str | None:
        normalized = normalize_manifest_path(file_path) or file_path
        return file_url_map.get(normalized)

    nodes = build_workspace_file_nodes(
        raw_nodes,
        file_url_builder=build_file_url,
    )
    return Response.success(data=nodes, message="Workspace files retrieved")
