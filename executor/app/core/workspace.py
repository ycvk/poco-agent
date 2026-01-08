import shutil
from pathlib import Path

from app.schemas.request import TaskConfig


class WorkspaceManager:
    def __init__(self, mount_path: str = "/workspace"):
        self.root_path = Path(mount_path)
        self.claude_config_path = self.root_path / ".claude"

        self.persistent_claude_data = self.root_path / ".claude_data"
        self.system_claude_home = Path.home() / ".claude"

    async def prepare(self, config: TaskConfig):
        if not self.root_path.exists():
            self.root_path.mkdir(parents=True, exist_ok=True)

        # await self._setup_session_persistence()

    async def _setup_session_persistence(self):
        self.persistent_claude_data.mkdir(exist_ok=True)

        if self.system_claude_home.exists() or self.system_claude_home.is_symlink():
            if self.system_claude_home.is_symlink():
                self.system_claude_home.unlink()
            else:
                shutil.rmtree(self.system_claude_home)

        self.system_claude_home.symlink_to(self.persistent_claude_data)

    async def cleanup(self):
        pass
