import re
from pathlib import Path
from typing import Any

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.services.storage_service import S3StorageService
from app.services.workspace_manager import WorkspaceManager


class SkillStager:
    def __init__(
        self,
        storage_service: S3StorageService | None = None,
        workspace_manager: WorkspaceManager | None = None,
    ) -> None:
        self.storage_service = storage_service or S3StorageService()
        self.workspace_manager = workspace_manager or WorkspaceManager()

    @staticmethod
    def _validate_skill_name(name: str) -> None:
        if name in {".", ".."} or not re.fullmatch(r"[A-Za-z0-9._-]+", name):
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message=f"Invalid skill name: {name}",
            )

    def stage_skills(
        self, user_id: str, session_id: str, skills: dict[str, Any]
    ) -> dict[str, dict[str, Any]]:
        if not skills:
            return {}

        session_dir = self.workspace_manager.get_workspace_path(
            user_id=user_id, session_id=session_id, create=True
        )
        workspace_dir = session_dir / "workspace"
        skills_root = workspace_dir / ".claude" / "skills"
        skills_root.mkdir(parents=True, exist_ok=True)

        staged: dict[str, dict[str, Any]] = {}
        skills_root_resolved = skills_root.resolve()
        for name, spec in skills.items():
            if not isinstance(spec, dict):
                continue
            self._validate_skill_name(name)
            if spec.get("enabled") is False:
                staged[name] = {"enabled": False}
                continue
            entry = spec.get("entry") if isinstance(spec.get("entry"), dict) else spec
            s3_key = entry.get("s3_key") or entry.get("key")
            if not s3_key:
                continue
            target_dir = (skills_root / name).resolve()
            if skills_root_resolved not in target_dir.parents:
                raise AppException(
                    error_code=ErrorCode.BAD_REQUEST,
                    message=f"Invalid skill path: {name}",
                )
            target_dir.mkdir(parents=True, exist_ok=True)

            try:
                if entry.get("is_prefix") or str(s3_key).endswith("/"):
                    self.storage_service.download_prefix(
                        prefix=str(s3_key), destination_dir=target_dir
                    )
                else:
                    filename = Path(str(s3_key)).name
                    destination = target_dir / filename
                    self.storage_service.download_file(
                        key=str(s3_key), destination=destination
                    )
            except Exception as exc:
                raise AppException(
                    error_code=ErrorCode.SKILL_DOWNLOAD_FAILED,
                    message=f"Failed to stage skill {name}: {exc}",
                ) from exc

            staged[name] = {
                **spec,
                "enabled": True,
                "local_path": str(target_dir),
                "entry": entry,
            }

        return staged
