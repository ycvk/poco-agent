"""
Base Git client for managing different git platforms.

This module provides an abstract base class for git platform clients,
allowing easy extension to support GitHub, GitLab, and other platforms.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Self


class GitPlatformError(Exception):
    """Base exception for git platform errors."""

    pass


class GitAuthError(GitPlatformError):
    """Exception raised when authentication fails."""

    pass


@dataclass
class GitRepository:
    """Represents a git repository."""

    id: str | int
    name: str
    full_name: str
    path_with_namespace: str
    private: bool
    clone_url: str
    ssh_url: str
    description: str | None = None
    default_branch: str | None = None


@dataclass
class GitUser:
    """Represents a git platform user."""

    id: str | int
    username: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


@dataclass
class GitBranch:
    """Represents a git branch."""

    name: str
    protected: bool = False
    commit: str | None = None
    merged: bool = False


@dataclass
class GitIssue:
    """Represents a git platform issue."""

    id: str | int
    title: str
    state: str
    description: str | None = None
    author: str | None = None
    created_at: str | None = None
    url: str | None = None


@dataclass
class GitPullRequest:
    """Represents a pull/merge request."""

    id: str | int
    title: str
    state: str
    source_branch: str
    target_branch: str
    description: str | None = None
    author: str | None = None
    created_at: str | None = None
    url: str | None = None


class BaseGitClient(ABC):
    """
    Abstract base class for git platform clients.

    This class defines the common interface that all git platform
    clients must implement, allowing for easy extension and consistent
    API across different platforms.
    """

    def __init__(self, token: str, timeout: float = 30.0):
        """
        Initialize git client.

        Args:
            token: Authentication token
            timeout: Request timeout in seconds
        """
        self.token = token
        self.timeout = timeout
        self._closed = False

    def close(self) -> None:
        """Release any underlying resources (e.g., HTTP sessions)."""
        self._closed = True

    def __enter__(self) -> Self:
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @abstractmethod
    def validate_token(self) -> bool:
        """
        Validate if the token is valid.

        Returns:
            bool: True if token is valid, False otherwise
        """
        pass

    @abstractmethod
    def get_user(self) -> GitUser:
        """
        Get authenticated user information.

        Returns:
            GitUser: User information

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @abstractmethod
    def get_repositories(self, **kwargs: Any) -> list[GitRepository]:
        """
        Get repositories for authenticated user.

        Args:
            **kwargs: Platform-specific parameters

        Returns:
            list[GitRepository]: List of repositories

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @abstractmethod
    def get_repository(self, owner: str, repo: str, **kwargs: Any) -> GitRepository:
        """
        Get a specific repository.

        Args:
            owner: Repository owner/namespace
            repo: Repository/project name
            **kwargs: Platform-specific parameters

        Returns:
            GitRepository: Repository information

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @abstractmethod
    def create_repository(
        self, name: str, description: str | None = None, **kwargs: Any
    ) -> GitRepository:
        """
        Create a new repository/project.

        Args:
            name: Repository/project name
            description: Repository/project description
            **kwargs: Platform-specific parameters

        Returns:
            GitRepository: Created repository/project information

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @abstractmethod
    def create_issue(
        self,
        repository: str,
        title: str,
        description: str | None = None,
        **kwargs: Any,
    ) -> GitIssue:
        """
        Create an issue in a repository.

        Args:
            repository: Repository identifier (owner/repo or project_id)
            title: Issue title
            description: Issue description
            **kwargs: Platform-specific parameters

        Returns:
            GitIssue: Created issue data

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @abstractmethod
    def create_pull_request(
        self,
        repository: str,
        title: str,
        source_branch: str,
        target_branch: str,
        description: str | None = None,
        **kwargs: Any,
    ) -> GitPullRequest:
        """
        Create a pull/merge request.

        Args:
            repository: Repository identifier (owner/repo or project_id)
            title: PR/MR title
            source_branch: Source branch name
            target_branch: Target branch name
            description: PR/MR description
            **kwargs: Platform-specific parameters

        Returns:
            GitPullRequest: Created PR/MR data

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @abstractmethod
    def get_branches(self, repository: str, **kwargs: Any) -> list[GitBranch]:
        """
        Get all branches in a repository.

        Args:
            repository: Repository identifier (owner/repo or project_id)
            **kwargs: Platform-specific parameters

        Returns:
            list[GitBranch]: List of branch information

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @abstractmethod
    def get_commits(
        self,
        repository: str,
        ref_name: str | None = None,
        **kwargs: Any,
    ) -> list[Any]:
        """
        Get commits from a repository.

        Args:
            repository: Repository identifier (owner/repo or project_id)
            ref_name: Branch or tag name (default: default branch)
            **kwargs: Platform-specific parameters

        Returns:
            list: List of commit information

        Raises:
            GitAuthError: If authentication fails
            GitPlatformError: If request fails
        """
        pass

    @property
    @abstractmethod
    def platform_name(self) -> str:
        """
        Get the platform name.

        Returns:
            str: Platform name (e.g., "GitHub", "GitLab")
        """
        pass
