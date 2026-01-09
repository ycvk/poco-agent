"""Git utilities for managing git operations and platforms."""

from app.utils.git.base import (
    BaseGitClient,
    GitAuthError,
    GitBranch,
    GitIssue,
    GitPlatformError,
    GitPullRequest,
    GitRepository,
    GitUser,
)
from app.utils.git.github import GitHubClient, GitHubError, GitHubAuthError
from app.utils.git.gitlab import GitLabClient, GitLabError, GitLabAuthError

__all__ = [
    # Base types
    "BaseGitClient",
    "GitAuthError",
    "GitBranch",
    "GitIssue",
    "GitPlatformError",
    "GitPullRequest",
    "GitRepository",
    "GitUser",
    # GitHub
    "GitHubClient",
    "GitHubError",
    "GitHubAuthError",
    # GitLab
    "GitLabClient",
    "GitLabError",
    "GitLabAuthError",
]
