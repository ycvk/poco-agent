from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.core.websocket.events import EventType, WSEvent
from app.core.websocket.manager import ws_manager
from app.models.agent_run import AgentRun
from app.models.agent_message import AgentMessage
from app.repositories.session_repository import SessionRepository
from app.repositories.skill_import_job_repository import SkillImportJobRepository
from app.repositories.user_input_request_repository import UserInputRequestRepository
from app.schemas.callback import AgentCallbackRequest
from app.schemas.skill_import import SkillImportCommitResponse, SkillImportJobResponse
from app.schemas.user_input_request import UserInputRequestResponse
from app.services.storage_service import S3StorageService
from app.utils.workspace import build_workspace_file_nodes
from app.utils.workspace_manifest import (
    build_nodes_from_manifest,
    extract_manifest_files,
    find_manifest_file,
    normalize_manifest_path,
)

from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


class WebSocketService:
    """Service for broadcasting events to WebSocket clients."""

    @staticmethod
    def _get_progress(db: Session, session_uuid: uuid.UUID, status: str) -> int:
        db_run = (
            db.query(AgentRun)
            .filter(AgentRun.session_id == session_uuid)
            .order_by(AgentRun.created_at.desc())
            .first()
        )
        if status == "completed":
            return 100
        if not db_run:
            return 0
        return int(db_run.progress or 0)

    async def send_session_snapshot(self, websocket: WebSocket, *, session_id: str) -> None:
        """Send a full session snapshot over an active WebSocket connection."""
        db = SessionLocal()
        try:
            session_uuid: uuid.UUID | None = None
            db_session = None
            try:
                session_uuid = uuid.UUID(session_id)
                db_session = SessionRepository.get_by_id(db, session_uuid)
            except ValueError:
                db_session = SessionRepository.get_by_sdk_session_id(db, session_id)
                session_uuid = db_session.id if db_session else None

            if not db_session or not session_uuid:
                await websocket.send_json(
                    WSEvent(
                        type=EventType.SESSION_SNAPSHOT,
                        session_id=session_id,
                        data={
                            "status": "not_found",
                            "progress": 0,
                            "state_patch": {},
                            "config_snapshot": None,
                            "workspace_export_status": None,
                            "workspace_manifest_key": None,
                            "workspace_files_prefix": None,
                            "title": None,
                            "updated_at": None,
                        },
                    ).to_dict()
                )
                return

            snapshot_event = WSEvent(
                type=EventType.SESSION_SNAPSHOT,
                session_id=str(session_uuid),
                data={
                    "status": db_session.status,
                    "progress": self._get_progress(db, session_uuid, db_session.status),
                    "state_patch": db_session.state_patch or {},
                    "config_snapshot": db_session.config_snapshot,
                    "workspace_export_status": db_session.workspace_export_status,
                    "workspace_manifest_key": db_session.workspace_manifest_key,
                    "workspace_files_prefix": db_session.workspace_files_prefix,
                    "title": db_session.title,
                    "updated_at": db_session.updated_at.isoformat()
                    if db_session.updated_at
                    else None,
                },
            )
            await websocket.send_json(snapshot_event.to_dict())

            await self.send_user_input_requests(websocket, session_id=str(session_uuid))

            # If workspace is already ready, proactively send the file list.
            if (
                db_session.workspace_export_status == "ready"
                and db_session.workspace_manifest_key
            ):
                await self.send_workspace_files(websocket, session_id=str(session_uuid))
        finally:
            db.close()

    async def send_user_input_requests(self, websocket: WebSocket, *, session_id: str) -> None:
        """Send current pending user input requests for a session."""
        db = SessionLocal()
        try:
            try:
                session_uuid = uuid.UUID(session_id)
            except ValueError:
                return
            entries = UserInputRequestRepository.list_pending_by_session(
                db, session_id=session_uuid
            )
            payload = [
                UserInputRequestResponse.model_validate(e).model_dump(mode="json")
                for e in entries
            ]
            await websocket.send_json(
                WSEvent(
                    type=EventType.USER_INPUT_UPDATE,
                    session_id=str(session_uuid),
                    data={"requests": payload},
                ).to_dict()
            )
        finally:
            db.close()

    async def broadcast_user_input_requests(self, *, session_id: uuid.UUID) -> None:
        """Broadcast pending user input requests for a session to all clients."""
        db = SessionLocal()
        try:
            entries = UserInputRequestRepository.list_pending_by_session(
                db, session_id=session_id
            )
            payload = [
                UserInputRequestResponse.model_validate(e).model_dump(mode="json")
                for e in entries
            ]
        finally:
            db.close()

        await ws_manager.broadcast(
            str(session_id),
            WSEvent(
                type=EventType.USER_INPUT_UPDATE,
                session_id=str(session_id),
                data={"requests": payload},
            ).to_dict(),
        )

    async def send_workspace_files(self, websocket: WebSocket, *, session_id: str) -> None:
        """Send workspace files for a session (best-effort)."""
        db = SessionLocal()
        try:
            try:
                session_uuid = uuid.UUID(session_id)
            except ValueError:
                return
            db_session = SessionRepository.get_by_id(db, session_uuid)
            if not db_session:
                return
            payload = self._build_workspace_files_payload(
                manifest_key=db_session.workspace_manifest_key,
                files_prefix=db_session.workspace_files_prefix,
                export_status=db_session.workspace_export_status,
            )
            await websocket.send_json(
                WSEvent(
                    type=EventType.WORKSPACE_FILES,
                    session_id=str(session_uuid),
                    data=payload,
                ).to_dict()
            )
        finally:
            db.close()

    async def send_workspace_file_url(
        self,
        websocket: WebSocket,
        *,
        session_id: str,
        path: str,
    ) -> None:
        """Send a fresh presigned URL for a single workspace file path."""
        normalized = normalize_manifest_path(path)
        if not normalized:
            return

        db = SessionLocal()
        try:
            try:
                session_uuid = uuid.UUID(session_id)
            except ValueError:
                return
            db_session = SessionRepository.get_by_id(db, session_uuid)
            if not db_session or not db_session.workspace_manifest_key:
                await websocket.send_json(
                    WSEvent(
                        type=EventType.WORKSPACE_FILE_URL,
                        session_id=str(session_uuid),
                        data={"path": normalized, "url": None},
                    ).to_dict()
                )
                return

            try:
                storage_service = S3StorageService()
                manifest = storage_service.get_manifest(db_session.workspace_manifest_key)
            except Exception as exc:
                logger.warning(
                    "ws_workspace_file_url_failed",
                    extra={
                        "session_id": str(session_uuid),
                        "path": normalized,
                        "error": str(exc),
                    },
                )
                await websocket.send_json(
                    WSEvent(
                        type=EventType.WORKSPACE_FILE_URL,
                        session_id=str(session_uuid),
                        data={"path": normalized, "url": None},
                    ).to_dict()
                )
                return
            entry = find_manifest_file(manifest, normalized)
            if not entry:
                await websocket.send_json(
                    WSEvent(
                        type=EventType.WORKSPACE_FILE_URL,
                        session_id=str(session_uuid),
                        data={"path": normalized, "url": None},
                    ).to_dict()
                )
                return

            prefix = (db_session.workspace_files_prefix or "").rstrip("/")
            object_key = (
                entry.get("key")
                or entry.get("object_key")
                or entry.get("oss_key")
                or entry.get("s3_key")
            )
            if not object_key and prefix:
                object_key = f"{prefix}/{normalized.lstrip('/')}"

            if not object_key:
                await websocket.send_json(
                    WSEvent(
                        type=EventType.WORKSPACE_FILE_URL,
                        session_id=str(session_uuid),
                        data={"path": normalized, "url": None},
                    ).to_dict()
                )
                return

            mime_type = entry.get("mimeType") or entry.get("mime_type")
            url = storage_service.presign_get(
                object_key,
                response_content_disposition="inline",
                response_content_type=mime_type,
            )

            await websocket.send_json(
                WSEvent(
                    type=EventType.WORKSPACE_FILE_URL,
                    session_id=str(session_uuid),
                    data={"path": normalized, "url": url},
                ).to_dict()
            )
        finally:
            db.close()

    @staticmethod
    def _build_workspace_files_payload(
        *,
        manifest_key: str | None,
        files_prefix: str | None,
        export_status: str | None,
    ) -> dict[str, Any]:
        if not manifest_key:
            return {
                "export_status": export_status,
                "files": [],
                "error": "Workspace export is not ready",
            }

        try:
            storage_service = S3StorageService()
            manifest = storage_service.get_manifest(manifest_key)
            raw_nodes = build_nodes_from_manifest(manifest)
            manifest_files = extract_manifest_files(manifest)
            prefix = (files_prefix or "").rstrip("/")

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
            files_json = [node.model_dump(mode="json") for node in nodes]
            return {
                "export_status": export_status,
                "files": files_json,
                "error": None,
            }
        except Exception as exc:
            logger.warning(
                "ws_workspace_files_build_failed",
                extra={"manifest_key": manifest_key, "error": str(exc)},
            )
            return {
                "export_status": export_status,
                "files": [],
                "error": "Failed to build workspace files",
            }

    async def broadcast_callback(
        self,
        callback: AgentCallbackRequest,
        db_message: AgentMessage | None = None,
    ) -> None:
        """Broadcast callback data as WebSocket events."""
        session_id = callback.session_id

        if not await ws_manager.has_connections(session_id):
            return

        # Status/progress event
        status_event = WSEvent(
            type=EventType.SESSION_STATUS,
            session_id=session_id,
            data={
                "status": callback.status.value
                if hasattr(callback.status, "value")
                else str(callback.status),
                "progress": callback.progress or 0,
                "current_step": callback.state_patch.current_step
                if callback.state_patch
                else None,
            },
        )
        sent = await ws_manager.broadcast(session_id, status_event.to_dict())
        logger.debug(
            "ws_status_broadcast",
            extra={"session_id": session_id, "sent_count": sent},
        )

        # State patch event (todos/mcp/workspace/current_step)
        if callback.state_patch is not None:
            patch_event = WSEvent(
                type=EventType.SESSION_PATCH,
                session_id=session_id,
                data={"state_patch": callback.state_patch.model_dump(mode="json")},
            )
            await ws_manager.broadcast(session_id, patch_event.to_dict())

        # New message event - push full message content
        if db_message:
            message_event = WSEvent(
                type=EventType.MESSAGE_NEW,
                session_id=session_id,
                data={
                    "id": db_message.id,
                    "role": db_message.role,
                    "content": db_message.content,
                    "timestamp": db_message.created_at.isoformat() if db_message.created_at else None,
                    "text_preview": db_message.text_preview,
                },
            )
            await ws_manager.broadcast(session_id, message_event.to_dict())
            logger.debug(
                "ws_message_broadcast",
                extra={"session_id": session_id, "message_id": db_message.id},
            )

        # Workspace export status / manifest updates
        if callback.workspace_export_status is not None:
            export_event = WSEvent(
                type=EventType.WORKSPACE_EXPORT,
                session_id=session_id,
                data={
                    "export_status": callback.workspace_export_status,
                    "workspace_manifest_key": callback.workspace_manifest_key,
                    "workspace_files_prefix": callback.workspace_files_prefix,
                    "workspace_archive_key": callback.workspace_archive_key,
                },
            )
            await ws_manager.broadcast(session_id, export_event.to_dict())

        if (
            callback.workspace_export_status == "ready"
            and callback.workspace_manifest_key
        ):
            files_payload = self._build_workspace_files_payload(
                manifest_key=callback.workspace_manifest_key,
                files_prefix=callback.workspace_files_prefix,
                export_status=callback.workspace_export_status,
            )
            await ws_manager.broadcast(
                session_id,
                WSEvent(
                    type=EventType.WORKSPACE_FILES,
                    session_id=session_id,
                    data=files_payload,
                ).to_dict(),
            )

    async def broadcast_skill_import_job(self, *, job_id: uuid.UUID) -> None:
        """Broadcast a skill import job update to user-level WebSocket clients."""
        db = SessionLocal()
        try:
            job = SkillImportJobRepository.get_by_id(db, job_id)
            if job is None:
                return
            result = (
                SkillImportCommitResponse.model_validate(job.result)
                if isinstance(job.result, dict)
                else None
            )
            payload = SkillImportJobResponse(
                job_id=job.id,
                status=job.status,
                progress=int(job.progress or 0),
                result=result,
                error=job.error,
                created_at=job.created_at,
                updated_at=job.updated_at,
                started_at=job.started_at,
                finished_at=job.finished_at,
            ).model_dump(mode="json")
            user_key = f"user:{job.user_id}"
        finally:
            db.close()

        await ws_manager.broadcast(
            user_key,
            WSEvent(
                type=EventType.SKILL_IMPORT_JOB,
                session_id=user_key,
                data=payload,
            ).to_dict(),
        )

    async def send_skill_import_job(
        self,
        websocket: WebSocket,
        *,
        job_id: str,
        user_id: str | None = None,
    ) -> None:
        """Send a skill import job snapshot to a single WebSocket client."""
        try:
            job_uuid = uuid.UUID(job_id)
        except ValueError:
            return

        db = SessionLocal()
        try:
            job = SkillImportJobRepository.get_by_id(db, job_uuid)
            if job is None:
                return
            if user_id and job.user_id != user_id:
                logger.warning(
                    "ws_skill_import_job_forbidden",
                    extra={
                        "job_id": str(job.id),
                        "requesting_user_id": user_id,
                        "owner_user_id": job.user_id,
                    },
                )
                return
            result = (
                SkillImportCommitResponse.model_validate(job.result)
                if isinstance(job.result, dict)
                else None
            )
            payload = SkillImportJobResponse(
                job_id=job.id,
                status=job.status,
                progress=int(job.progress or 0),
                result=result,
                error=job.error,
                created_at=job.created_at,
                updated_at=job.updated_at,
                started_at=job.started_at,
                finished_at=job.finished_at,
            ).model_dump(mode="json")
            user_key = f"user:{job.user_id}"
        finally:
            db.close()

        await websocket.send_json(
            WSEvent(
                type=EventType.SKILL_IMPORT_JOB,
                session_id=user_key,
                data=payload,
            ).to_dict()
        )


websocket_service = WebSocketService()
