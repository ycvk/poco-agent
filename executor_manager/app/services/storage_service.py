import logging
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.core.settings import get_settings

logger = logging.getLogger(__name__)


class S3StorageService:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.s3_bucket:
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="S3 bucket is not configured",
            )
        if not settings.s3_endpoint:
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="S3 endpoint is not configured",
            )
        if not settings.s3_access_key or not settings.s3_secret_key:
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="S3 credentials are not configured",
            )

        self.bucket = settings.s3_bucket

        config_kwargs: dict[str, Any] = {}
        if settings.s3_force_path_style:
            config_kwargs["s3"] = {"addressing_style": "path"}
        config = Config(**config_kwargs) if config_kwargs else None

        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=config,
        )

    def upload_file(
        self, *, file_path: str, key: str, content_type: str | None = None
    ) -> None:
        extra_args: dict[str, Any] = {}
        if content_type:
            extra_args["ContentType"] = content_type
        try:
            if extra_args:
                self.client.upload_file(
                    file_path, self.bucket, key, ExtraArgs=extra_args
                )
            else:
                self.client.upload_file(file_path, self.bucket, key)
        except (ClientError, BotoCoreError) as exc:
            logger.error(f"Failed to upload {file_path} to {key}: {exc}")
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="Failed to upload workspace file",
                details={"key": key, "file_path": file_path, "error": str(exc)},
            ) from exc

    def put_object(
        self,
        *,
        key: str,
        body: bytes,
        content_type: str | None = None,
    ) -> None:
        kwargs: dict[str, Any] = {"Bucket": self.bucket, "Key": key, "Body": body}
        if content_type:
            kwargs["ContentType"] = content_type
        try:
            self.client.put_object(**kwargs)
        except (ClientError, BotoCoreError) as exc:
            logger.error(f"Failed to put object {key}: {exc}")
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="Failed to upload workspace manifest",
                details={"key": key, "error": str(exc)},
            ) from exc

    def list_objects(self, prefix: str) -> Iterable[str]:
        try:
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                for item in page.get("Contents", []) or []:
                    key = item.get("Key")
                    if key:
                        yield key
        except (ClientError, BotoCoreError) as exc:
            logger.error(f"Failed to list objects for {prefix}: {exc}")
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="Failed to list objects",
                details={"prefix": prefix, "error": str(exc)},
            ) from exc

    def download_file(self, *, key: str, destination: Path) -> None:
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            self.client.download_file(self.bucket, key, str(destination))
        except (ClientError, BotoCoreError) as exc:
            logger.error(f"Failed to download {key}: {exc}")
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="Failed to download file",
                details={"key": key, "error": str(exc)},
            ) from exc

    def download_prefix(self, *, prefix: str, destination_dir: Path) -> None:
        for key in self.list_objects(prefix):
            if key.endswith("/"):
                continue
            relative = key[len(prefix) :].lstrip("/")
            if not relative:
                continue
            target = self._safe_destination(destination_dir, relative)
            self.download_file(key=key, destination=target)

    @staticmethod
    def _safe_destination(destination_dir: Path, relative: str) -> Path:
        rel_path = PurePosixPath(relative)
        if rel_path.is_absolute() or ".." in rel_path.parts:
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="Invalid object key path",
                details={"relative": relative},
            )
        base = destination_dir.resolve()
        target = (destination_dir / Path(rel_path.as_posix())).resolve()
        if base not in target.parents:
            raise AppException(
                error_code=ErrorCode.EXTERNAL_SERVICE_ERROR,
                message="Resolved path escapes destination directory",
                details={"relative": relative},
            )
        return target
