from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import uuid as uuid_module

from app.core.deps import get_current_user_id, get_db
from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.repositories.message_repository import MessageRepository
from app.schemas.message import MessageResponse
from app.schemas.response import Response, ResponseSchema
from app.services.message_service import MessageService
from app.services.session_service import SessionService

router = APIRouter(prefix="/messages", tags=["messages"])

message_service = MessageService()
session_service = SessionService()


@router.get("/{message_id}", response_model=ResponseSchema[MessageResponse])
async def get_message(
    message_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Gets a message by ID."""
    message = message_service.get_message(db, message_id)
    db_session = session_service.get_session(db, message.session_id)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Message does not belong to the user",
        )
    return Response.success(
        data=MessageResponse.model_validate(message),
        message="Message retrieved successfully",
    )


@router.get(
    "/sessions/{session_id}/since/{after_id}",
    response_model=ResponseSchema[list[MessageResponse]],
)
async def get_messages_since(
    session_id: str,
    after_id: int,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Gets all messages after the specified message ID."""
    try:
        session_uuid = uuid_module.UUID(session_id)
    except ValueError:
        raise AppException(
            error_code=ErrorCode.INVALID_INPUT,
            message="Invalid session ID format",
        )

    db_session = session_service.get_session(db, session_uuid)
    if db_session.user_id != user_id:
        raise AppException(
            error_code=ErrorCode.FORBIDDEN,
            message="Session does not belong to the user",
        )

    messages = MessageRepository.get_after_id(db, session_uuid, after_id)
    return Response.success(
        data=[MessageResponse.model_validate(msg) for msg in messages],
        message=f"Found {len(messages)} new messages",
    )
