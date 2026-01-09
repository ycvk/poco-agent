"""
Git platform client for managing GitHub.

This module provides GitHub client implementation
of BaseGitClient for GitHub platform.
"""

import httpx
from typing import Any

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


class GitHubError(GitPlatformError):
    """Exception raised when GitHub API fails."""

    pass


class GitHubAuthError(GitAuthError):
    """Exception raised when GitHub authentication fails."""

    pass


class GitHubClient(BaseGitClient):
    """
    GitHub API client implementation.

    This class provides a complete interface for GitHub operations,
    including repository management, issue tracking, and PR management.
    """

    def __init__(
        self,
        token: str,
        base_url: str = "https://api.github.com",
        timeout: float = 30.0,
        http_client: httpx.Client | None = None,
    ):
        """
        Initialize GitHub client.

        Args:
            token: GitHub personal access token
            base_url: GitHub API base URL (for GitHub Enterprise)
            timeout: Request timeout in seconds
            http_client: Optional pre-configured httpx.Client (for reuse/testing)
        """
        super().__init__(token, timeout)
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        self._client = http_client or httpx.Client(
            base_url=self.base_url,
            timeout=self.timeout,
            headers=self.headers,
        )
        self._owns_client = http_client is None

    def close(self) -> None:
        if self._closed:
            return
        if self._owns_client:
            self._client.close()
        super().close()

    @staticmethod
    def _to_repository(repo: dict[str, Any]) -> GitRepository:
        return GitRepository(
            id=repo["id"],
            name=repo["name"],
            full_name=repo["full_name"],
            path_with_namespace=repo["full_name"],
            private=repo["private"],
            clone_url=repo["clone_url"],
            ssh_url=repo["ssh_url"],
            description=repo.get("description"),
            default_branch=repo.get("default_branch"),
        )

    @staticmethod
    def _to_issue(issue: dict[str, Any]) -> GitIssue:
        return GitIssue(
            id=issue["id"],
            title=issue["title"],
            description=issue.get("body"),
            state=issue["state"],
            author=issue.get("user", {}).get("login"),
            created_at=issue.get("created_at"),
            url=issue.get("html_url"),
        )

    @staticmethod
    def _to_pull_request(
        pr: dict[str, Any],
        *,
        source_branch: str,
        target_branch: str,
    ) -> GitPullRequest:
        return GitPullRequest(
            id=pr["id"],
            title=pr["title"],
            description=pr.get("body"),
            state=pr["state"],
            author=pr.get("user", {}).get("login"),
            source_branch=source_branch,
            target_branch=target_branch,
            created_at=pr.get("created_at"),
            url=pr.get("html_url"),
        )

    def _request(self, method: str, endpoint: str, **kwargs: Any) -> Any:
        """
        Make authenticated request to GitHub API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint (e.g., "/user/repos")
            **kwargs: Additional arguments for httpx.request

        Returns:
            dict: JSON response data

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        try:
            response = self._client.request(
                method,
                endpoint,
                **kwargs,
            )

            if response.status_code == 401:
                raise GitHubAuthError("Invalid GitHub token")
            elif response.status_code == 403:
                raise GitHubAuthError("Token lacks required permissions")
            elif response.status_code >= 400:
                raise GitHubError(
                    f"GitHub API error: {response.status_code} - {response.text}"
                )

            if response.status_code == 204:
                return None

            if not response.content:
                return None

            return response.json()
        except httpx.TimeoutException as e:
            raise GitHubError(f"GitHub API timeout: {e}") from e
        except httpx.RequestError as e:
            raise GitHubError(f"GitHub API request failed: {e}") from e
        except ValueError as e:
            raise GitHubError("GitHub API returned invalid JSON") from e

    def validate_token(self) -> bool:
        """
        Validate if the token is valid.

        Returns:
            bool: True if token is valid, False otherwise
        """
        try:
            self.get_user()
            return True
        except GitHubAuthError:
            return False
        except GitHubError:
            return False

    def get_user(self) -> GitUser:
        """
        Get authenticated user information.

        Returns:
            GitUser: User information

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        data = self._request("GET", "/user")
        return GitUser(
            id=data["id"],
            username=data["login"],
            name=data.get("name"),
            email=data.get("email"),
            avatar_url=data.get("avatar_url"),
        )

    def get_repositories(self, type: str = "all", **kwargs: Any) -> list[GitRepository]:
        """
        Get repositories for authenticated user.

        Args:
            type: Repository type ('all', 'owner', 'member')

        Returns:
            list[GitRepository]: List of repositories

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        params = {"type": type} if type != "all" else {}
        data = self._request("GET", "/user/repos", params=params)

        return [self._to_repository(repo) for repo in data]

    def get_repository(self, owner: str, repo: str, **kwargs: Any) -> GitRepository:
        """
        Get a specific repository.

        Args:
            owner: Repository owner
            repo: Repository name

        Returns:
            GitRepository: Repository information

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        data = self._request("GET", f"/repos/{owner}/{repo}")
        return self._to_repository(data)

    def create_repository(
        self, name: str, description: str | None = None, **kwargs: Any
    ) -> GitRepository:
        """
        Create a new repository.

        Args:
            name: Repository name
            description: Repository description
            **kwargs: Platform-specific parameters (private, auto_init, etc.)

        Returns:
            GitRepository: Created repository information

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        private = kwargs.get("private", False)
        auto_init = kwargs.get("auto_init", True)

        payload = {
            "name": name,
            "private": private,
            "auto_init": auto_init,
        }

        if description:
            payload["description"] = description

        data = self._request("POST", "/user/repos", json=payload)

        return self._to_repository(data)

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
            repository: Repository identifier (owner/repo)
            title: Issue title
            description: Issue description
            **kwargs: Platform-specific parameters (labels, assignees, etc.)

        Returns:
            GitIssue: Created issue data

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        owner, repo = repository.split("/")
        labels = kwargs.get("labels")

        payload = {"title": title}

        if description:
            payload["body"] = description
        if labels:
            payload["labels"] = labels

        data = self._request("POST", f"/repos/{owner}/{repo}/issues", json=payload)

        return self._to_issue(data)

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
        Create a pull request.

        Args:
            repository: Repository identifier (owner/repo)
            title: PR title
            source_branch: Source branch (format: "user:branch")
            target_branch: Target branch
            description: PR description
            **kwargs: Platform-specific parameters

        Returns:
            GitPullRequest: Created PR data

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        owner, repo = repository.split("/")

        payload = {
            "title": title,
            "head": source_branch,
            "base": target_branch,
        }

        if description:
            payload["body"] = description

        data = self._request("POST", f"/repos/{owner}/{repo}/pulls", json=payload)

        return self._to_pull_request(
            data,
            source_branch=source_branch,
            target_branch=target_branch,
        )

    def get_branches(self, repository: str, **kwargs: Any) -> list[GitBranch]:
        """
        Get all branches in a repository.

        Args:
            repository: Repository identifier (owner/repo)
            **kwargs: Platform-specific parameters

        Returns:
            list[GitBranch]: List of branch information

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        owner, repo = repository.split("/")
        data = self._request("GET", f"/repos/{owner}/{repo}/branches")

        return [
            GitBranch(
                name=branch["name"],
                protected=branch.get("protected", False),
                commit=branch.get("commit", {}).get("sha"),
                merged=branch.get("merged", False),
            )
            for branch in data
        ]

    def get_commits(
        self,
        repository: str,
        ref_name: str | None = None,
        **kwargs: Any,
    ) -> list[Any]:
        """
        Get commits from a repository.

        Args:
            repository: Repository identifier (owner/repo)
            ref_name: Branch or tag name (default: default branch)
            **kwargs: Platform-specific parameters (per_page, since, until)

        Returns:
            list: List of commit information

        Raises:
            GitHubAuthError: If authentication fails
            GitHubError: If request fails
        """
        owner, repo = repository.split("/")
        per_page = kwargs.get("per_page", 30)

        params = {"per_page": per_page}
        endpoint = f"/repos/{owner}/{repo}/commits"
        if ref_name:
            params["sha"] = ref_name

        data = self._request("GET", endpoint, params=params)
        return data

    @property
    def platform_name(self) -> str:
        """Get the platform name."""
        return "GitHub"
