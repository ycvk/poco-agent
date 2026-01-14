from typing import Literal

from pydantic import BaseModel


class FileNode(BaseModel):
    id: str
    name: str
    type: Literal["file", "folder"]
    path: str
    children: list["FileNode"] | None = None
    mimeType: str | None = None
