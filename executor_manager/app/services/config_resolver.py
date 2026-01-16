import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.services.backend_client import BackendClient


_ENV_PATTERN = re.compile(r"\$\{env:([^}]+)\}")


def _resolve_env_value(value: Any, env_map: dict[str, str]) -> Any:
    if isinstance(value, str):
        matches = _ENV_PATTERN.findall(value)
        if not matches:
            return value
        resolved = value
        for var in matches:
            if var not in env_map:
                raise AppException(
                    error_code=ErrorCode.ENV_VAR_NOT_FOUND,
                    message=f"Env var not found: {var}",
                )
            resolved = resolved.replace(f"${{env:{var}}}", env_map[var])
        return resolved
    if isinstance(value, list):
        return [_resolve_env_value(v, env_map) for v in value]
    if isinstance(value, dict):
        return {k: _resolve_env_value(v, env_map) for k, v in value.items()}
    return value


class ConfigResolver:
    def __init__(self, backend_client: BackendClient | None = None) -> None:
        self.backend_client = backend_client or BackendClient()
        self._cache_until: datetime | None = None
        self._mcp_presets: dict[str, dict] = {}
        self._skill_presets: dict[str, dict] = {}

    async def resolve(self, config_snapshot: dict) -> dict:
        await self._ensure_cache()
        env_map = await self._get_env_map()

        mcp_config = config_snapshot.get("mcp_config") or {}
        skill_files = config_snapshot.get("skill_files") or {}

        resolved_mcp = self._resolve_mcp(mcp_config, env_map)
        resolved_skills = self._resolve_skills(skill_files, env_map)

        resolved = dict(config_snapshot)
        resolved["mcp_config"] = resolved_mcp
        resolved["skill_files"] = resolved_skills
        return resolved

    async def _ensure_cache(self) -> None:
        now = datetime.now(timezone.utc)
        if self._cache_until and now < self._cache_until:
            return
        mcp_presets = await self.backend_client.list_mcp_presets(include_inactive=True)
        skill_presets = await self.backend_client.list_skill_presets(
            include_inactive=True
        )
        self._mcp_presets = {p["name"]: p for p in mcp_presets}
        self._skill_presets = {p["name"]: p for p in skill_presets}
        self._cache_until = now + timedelta(seconds=60)

    async def _get_env_map(self) -> dict[str, str]:
        env_vars = await self.backend_client.list_env_vars(include_secrets=True)
        env_map: dict[str, str] = {}
        for item in env_vars:
            key = item.get("key")
            value = item.get("value")
            if not key or value is None:
                continue
            env_map[key] = value
        return env_map

    def _resolve_mcp(self, mcp_config: dict, env_map: dict[str, str]) -> dict:
        resolved: dict = {}
        for name, config in mcp_config.items():
            if not isinstance(config, dict):
                resolved[name] = config
                continue
            if config.get("enabled") is False or config.get("disabled") is True:
                continue
            ref = config.get("$ref")
            if ref:
                preset_name = ref.split(":", 1)[-1]
                preset = self._mcp_presets.get(preset_name)
                if not preset or not preset.get("is_active", True):
                    raise AppException(
                        error_code=ErrorCode.MCP_PRESET_NOT_FOUND,
                        message=f"MCP preset not found: {preset_name}",
                    )
                base: dict = {"transport": preset.get("transport")}
                default_config = preset.get("default_config") or {}
                base.update(default_config)
                override = {k: v for k, v in config.items() if k != "$ref"}
                base.update(override)
                resolved[name] = _resolve_env_value(base, env_map)
            else:
                resolved[name] = _resolve_env_value(config, env_map)
        return resolved

    def _resolve_skills(self, skills: dict, env_map: dict[str, str]) -> dict:
        resolved: dict = {}
        for name, config in skills.items():
            if not isinstance(config, dict):
                continue
            if config.get("enabled") is False:
                resolved[name] = {"enabled": False}
                continue
            ref = config.get("$ref")
            if ref:
                preset_name = ref.split(":", 1)[-1]
                preset = self._skill_presets.get(preset_name)
                if not preset or not preset.get("is_active", True):
                    raise AppException(
                        error_code=ErrorCode.SKILL_PRESET_NOT_FOUND,
                        message=f"Skill preset not found: {preset_name}",
                    )
                base = {"enabled": True, "entry": preset.get("entry")}
                default_config = preset.get("default_config") or {}
                base["config"] = default_config
                override = {k: v for k, v in config.items() if k != "$ref"}
                base.update(override)
                resolved[name] = _resolve_env_value(base, env_map)
            else:
                resolved[name] = _resolve_env_value(config, env_map)
        return resolved
