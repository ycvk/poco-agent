from typing import Any, Literal

from pydantic import BaseModel


class FileNode(BaseModel):
    """Workspace file node for UI browsing."""

    id: str
    name: str
    type: Literal["file", "folder"]
    path: str
    children: list["FileNode"] | None = None
    url: str | None = None
    mimeType: str | None = None
    oss_status: str | None = None
    oss_meta: dict[str, Any] | None = None
