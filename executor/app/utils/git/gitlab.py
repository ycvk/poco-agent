"""
Git platform clients for managing GitLab.

This module provides GitLab client implementation
of BaseGitClient for GitLab platform.
"""

import httpx
from typing import Any, Literal
from urllib.parse import quote

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


class GitLabError(GitPlatformError):
    """Exception raised when GitLab API fails."""

    pass


class GitLabAuthError(GitAuthError):
    """Exception raised when GitLab authentication fails."""

    pass


class GitLabClient(BaseGitClient):
    """
    GitLab API client implementation.

    This class provides a complete interface for GitLab operations,
    including project management, issue tracking, and MR management.
    """

    def __init__(
        self,
        token: str,
        base_url: str,
        timeout: float = 30.0,
        auth_type: Literal["bearer", "private-token"] = "bearer",
        http_client: httpx.Client | None = None,
    ):
        """
        Initialize GitLab client.

        Args:
            token: GitLab personal access token
            base_url: GitLab instance URL (e.g., "https://gitlab.com")
            timeout: Request timeout in seconds
            auth_type: Auth header type ("bearer" or "private-token")
            http_client: Optional pre-configured httpx.Client (for reuse/testing)
        """
        super().__init__(token, timeout)
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.headers = self._build_headers()
        self._client = http_client or httpx.Client(
            base_url=f"{self.base_url}/api/v4",
            timeout=self.timeout,
            headers=self.headers,
        )
        self._owns_client = http_client is None

    def _build_headers(self) -> dict[str, str]:
        headers: dict[str, str]
        if self.auth_type == "private-token":
            headers = {"PRIVATE-TOKEN": self.token}
        else:
            headers = {"Authorization": f"Bearer {self.token}"}

        headers.setdefault("Accept", "application/json")
        return headers

    def close(self) -> None:
        if self._closed:
            return
        if self._owns_client:
            self._client.close()
        super().close()

    @staticmethod
    def _to_repository(project: dict[str, Any]) -> GitRepository:
        visibility = project.get("visibility")
        is_private = (
            visibility != "public" if visibility else not project.get("public", False)
        )
        return GitRepository(
            id=project["id"],
            name=project["name"],
            full_name=project["name_with_namespace"],
            path_with_namespace=project["path_with_namespace"],
            private=is_private,
            clone_url=project["http_url_to_repo"],
            ssh_url=project["ssh_url_to_repo"],
            description=project.get("description"),
            default_branch=project.get("default_branch"),
        )

    @staticmethod
    def _to_issue(issue: dict[str, Any]) -> GitIssue:
        return GitIssue(
            id=issue["id"],
            title=issue["title"],
            description=issue.get("description"),
            state=issue["state"],
            author=issue.get("author", {}).get("username"),
            created_at=issue.get("created_at"),
            url=issue.get("web_url"),
        )

    @staticmethod
    def _to_pull_request(
        mr: dict[str, Any],
        *,
        source_branch: str,
        target_branch: str,
    ) -> GitPullRequest:
        return GitPullRequest(
            id=mr["id"],
            title=mr["title"],
            description=mr.get("description"),
            state=mr["state"],
            author=mr.get("author", {}).get("username"),
            source_branch=source_branch,
            target_branch=target_branch,
            created_at=mr.get("created_at"),
            url=mr.get("web_url"),
        )

    def _request(self, method: str, endpoint: str, **kwargs: Any) -> Any:
        """
        Make authenticated request to GitLab API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint (e.g., "/user")
            **kwargs: Additional arguments for httpx.request

        Returns:
            dict: JSON response data

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        try:
            response = self._client.request(
                method,
                endpoint,
                **kwargs,
            )

            if response.status_code == 401:
                raise GitLabAuthError("Invalid GitLab token")
            elif response.status_code == 403:
                raise GitLabAuthError("Token lacks required permissions")
            elif response.status_code >= 400:
                raise GitLabError(
                    f"GitLab API error: {response.status_code} - {response.text}"
                )

            if response.status_code == 204:
                return None

            if not response.content:
                return None

            return response.json()
        except httpx.TimeoutException as e:
            raise GitLabError(f"GitLab API timeout: {e}") from e
        except httpx.RequestError as e:
            raise GitLabError(f"GitLab API request failed: {e}") from e
        except ValueError as e:
            raise GitLabError("GitLab API returned invalid JSON") from e

    def validate_token(self) -> bool:
        """
        Validate if the token is valid.

        Returns:
            bool: True if token is valid, False otherwise
        """
        try:
            self.get_user()
            return True
        except GitLabAuthError:
            return False
        except GitLabError:
            return False

    def get_user(self) -> GitUser:
        """
        Get authenticated user information.

        Returns:
            GitUser: User information

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        data = self._request("GET", "/user")
        return GitUser(
            id=data["id"],
            username=data["username"],
            name=data.get("name"),
            email=data.get("email"),
            avatar_url=data.get("avatar_url"),
        )

    def get_repositories(self, **kwargs: Any) -> list[GitRepository]:
        """
        Get projects for authenticated user.

        Returns:
            list[GitRepository]: List of projects

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        data = self._request("GET", "/projects")

        return [self._to_repository(project) for project in data]

    def get_repository(self, owner: str, repo: str, **kwargs: Any) -> GitRepository:
        """
        Get a specific project.

        Args:
            owner: Namespace (GitLab doesn't use owner)
            repo: Project name
            **kwargs: Platform-specific parameters (project_id, path)

        Returns:
            GitRepository: Project information

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        if kwargs.get("project_id"):
            endpoint = f"/projects/{kwargs['project_id']}"
        elif kwargs.get("path"):
            raw_path = str(kwargs["path"])
            encoded_path = raw_path if "%" in raw_path else quote(raw_path, safe="")
            endpoint = f"/projects/{encoded_path}"
        else:
            endpoint = f"/projects/{quote(f'{owner}/{repo}', safe='')}"

        data = self._request("GET", endpoint)

        return self._to_repository(data)

    def create_repository(
        self, name: str, description: str | None = None, **kwargs: Any
    ) -> GitRepository:
        """
        Create a new project.

        Args:
            name: Project name
            description: Project description
            **kwargs: Platform-specific parameters (private, initialize_with_readme, namespace_id)

        Returns:
            GitRepository: Created project information

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        private = kwargs.get("private", False)
        initialize_with_readme = kwargs.get("initialize_with_readme", True)
        namespace_id = kwargs.get("namespace_id")

        payload = {
            "name": name,
            "initialize_with_readme": initialize_with_readme,
        }
        payload["visibility"] = "private" if private else "public"

        if description:
            payload["description"] = description
        if namespace_id:
            payload["namespace_id"] = namespace_id

        data = self._request("POST", "/projects", json=payload)

        return self._to_repository(data)

    def create_issue(
        self,
        repository: str,
        title: str,
        description: str | None = None,
        **kwargs: Any,
    ) -> GitIssue:
        """
        Create an issue in a project.

        Args:
            repository: Project ID (GitLab uses project_id)
            title: Issue title
            description: Issue description
            **kwargs: Platform-specific parameters (labels, assignees)

        Returns:
            GitIssue: Created issue data

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        labels = kwargs.get("labels")

        payload = {"title": title}

        if description:
            payload["description"] = description
        if labels:
            payload["labels"] = labels

        data = self._request("POST", f"/projects/{repository}/issues", json=payload)

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
        Create a merge request.

        Args:
            repository: Project ID (GitLab uses project_id)
            title: MR title
            source_branch: Source branch name
            target_branch: Target branch name
            description: MR description
            **kwargs: Platform-specific parameters

        Returns:
            GitPullRequest: Created MR data

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        payload = {
            "title": title,
            "source_branch": source_branch,
            "target_branch": target_branch,
        }

        if description:
            payload["description"] = description

        data = self._request(
            "POST", f"/projects/{repository}/merge_requests", json=payload
        )

        return self._to_pull_request(
            data,
            source_branch=source_branch,
            target_branch=target_branch,
        )

    def get_branches(self, repository: str, **kwargs: Any) -> list[GitBranch]:
        """
        Get all branches in a project.

        Args:
            repository: Project ID
            **kwargs: Platform-specific parameters

        Returns:
            list[GitBranch]: List of branch information

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        data = self._request("GET", f"/projects/{repository}/repository/branches")

        return [
            GitBranch(
                name=branch["name"],
                protected=branch.get("protected", False),
                commit=branch.get("commit", {}).get("id"),
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
        Get commits from a project.

        Args:
            repository: Project ID
            ref_name: Branch or tag name (default: default branch)
            **kwargs: Platform-specific parameters (per_page, since, until)

        Returns:
            list: List of commit information

        Raises:
            GitLabAuthError: If authentication fails
            GitLabError: If request fails
        """
        per_page = kwargs.get("per_page", 20)

        params = {"per_page": per_page}
        endpoint = f"/projects/{repository}/repository/commits"
        if ref_name:
            params["ref_name"] = ref_name

        data = self._request("GET", endpoint, params=params)
        return data

    @property
    def platform_name(self) -> str:
        """Get the platform name."""
        return "GitLab"
